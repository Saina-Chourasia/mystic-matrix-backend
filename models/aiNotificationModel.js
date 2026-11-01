/**
 * MYSTIC MATRIX AI Notification Model
 * Persists actionable AI inventory insights, alerts, and notifications for Madam Hex
 */

const { getDb } = require('../config/db');

class AiNotificationModel {
    /**
     * Create an AI notification with deduplication
     */
    static create({ type, severity, title, message, product_id = null, metadata = null, dedup_key = null }) {
        const db = getDb();
        const metaStr = typeof metadata === 'object' && metadata !== null ? JSON.stringify(metadata) : metadata;
        
        // If dedup_key provided, check if an unread/undismissed notification already exists
        if (dedup_key) {
            const existing = db.prepare(`
                SELECT id, is_read, is_dismissed 
                FROM ai_notifications 
                WHERE dedup_key = ? AND is_dismissed = 0
            `).get(dedup_key);

            if (existing) {
                // Update existing alert's timestamp and message
                db.prepare(`
                    UPDATE ai_notifications
                    SET message = ?, title = ?, severity = ?, metadata = ?, created_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(message, title, severity, metaStr, existing.id);
                return existing.id;
            }
        }

        const stmt = db.prepare(`
            INSERT INTO ai_notifications (type, severity, title, message, product_id, metadata, dedup_key, is_read, is_dismissed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
        `);

        try {
            const result = stmt.run(type, severity, title, message, product_id, metaStr, dedup_key);
            return result.lastInsertRowid;
        } catch (err) {
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                // Fallback update on conflict
                const row = db.prepare('SELECT id FROM ai_notifications WHERE dedup_key = ?').get(dedup_key);
                if (row) {
                    db.prepare(`
                        UPDATE ai_notifications 
                        SET message = ?, title = ?, severity = ?, metadata = ?, is_dismissed = 0, created_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    `).run(message, title, severity, metaStr, row.id);
                    return row.id;
                }
            }
            throw err;
        }
    }

    /**
     * Query notifications with filtering and pagination
     */
    static getAll({ severity = null, unreadOnly = false, includeDismissed = false, limit = 50, offset = 0 } = {}) {
        const db = getDb();
        const conditions = [];
        const params = [];

        if (!includeDismissed) {
            conditions.push('n.is_dismissed = 0');
        }

        if (unreadOnly) {
            conditions.push('n.is_read = 0');
        }

        if (severity && severity !== 'ALL') {
            conditions.push('n.severity = ?');
            params.push(severity.toUpperCase());
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const sql = `
            SELECT 
                n.id,
                n.type,
                n.severity,
                n.title,
                n.message,
                n.product_id,
                n.metadata,
                n.is_read,
                n.is_dismissed,
                n.dedup_key,
                n.created_at,
                n.resolved_at,
                p.name AS product_name,
                p.sku AS product_sku,
                p.current_stock AS product_current_stock,
                p.item_type AS product_type
            FROM ai_notifications n
            LEFT JOIN products p ON n.product_id = p.id
            ${whereClause}
            ORDER BY 
                CASE n.severity 
                    WHEN 'CRITICAL' THEN 1 
                    WHEN 'WARNING' THEN 2 
                    WHEN 'INFO' THEN 3 
                    ELSE 4 
                END ASC,
                n.created_at DESC
            LIMIT ? OFFSET ?
        `;

        params.push(parseInt(limit, 10), parseInt(offset, 10));
        const rows = db.prepare(sql).all(...params);

        return rows.map(r => ({
            ...r,
            is_read: Boolean(r.is_read),
            is_dismissed: Boolean(r.is_dismissed),
            metadata: r.metadata ? JSON.parse(r.metadata) : null
        }));
    }

    /**
     * Get aggregate notification counts (unread, critical, warning, info)
     */
    static getStats() {
        const db = getDb();
        const row = db.prepare(`
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
                SUM(CASE WHEN severity = 'CRITICAL' AND is_read = 0 THEN 1 ELSE 0 END) AS critical_count,
                SUM(CASE WHEN severity = 'WARNING' AND is_read = 0 THEN 1 ELSE 0 END) AS warning_count,
                SUM(CASE WHEN severity = 'INFO' AND is_read = 0 THEN 1 ELSE 0 END) AS info_count
            FROM ai_notifications
            WHERE is_dismissed = 0
        `).get();

        return {
            total: row.total || 0,
            unread: row.unread_count || 0,
            critical: row.critical_count || 0,
            warning: row.warning_count || 0,
            info: row.info_count || 0
        };
    }

    /**
     * Mark a single notification as read
     */
    static markAsRead(id) {
        const db = getDb();
        db.prepare('UPDATE ai_notifications SET is_read = 1 WHERE id = ?').run(id);
        return true;
    }

    /**
     * Mark all active notifications as read
     */
    static markAllAsRead() {
        const db = getDb();
        db.prepare('UPDATE ai_notifications SET is_read = 1 WHERE is_dismissed = 0').run();
        return true;
    }

    /**
     * Dismiss a notification
     */
    static dismiss(id) {
        const db = getDb();
        db.prepare('UPDATE ai_notifications SET is_dismissed = 1, is_read = 1 WHERE id = ?').run(id);
        return true;
    }

    /**
     * Resolve a notification (mark as resolved)
     */
    static resolve(id) {
        const db = getDb();
        db.prepare('UPDATE ai_notifications SET resolved_at = CURRENT_TIMESTAMP, is_read = 1 WHERE id = ?').run(id);
        return true;
    }

    /**
     * Resolve all notifications matching a dedup prefix (e.g. when product stock is restored)
     */
    static resolveByDedupKey(dedupKey) {
        const db = getDb();
        db.prepare('UPDATE ai_notifications SET resolved_at = CURRENT_TIMESTAMP WHERE dedup_key = ?').run(dedupKey);
        return true;
    }
}

module.exports = AiNotificationModel;

