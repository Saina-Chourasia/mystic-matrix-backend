const { getDb } = require('../config/db');

class AuditModel {
    log({ userId = null, action, entityType, entityId = null, details = null, ipAddress = null }) {
        try {
            const db = getDb();
            const serializedDetails = typeof details === 'object' && details !== null 
                ? JSON.stringify(details) 
                : (details || null);

            db.prepare(`
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(userId, action, entityType, entityId ? String(entityId) : null, serializedDetails, ipAddress);
        } catch (err) {
            console.error('Failed to write audit log:', err.message);
        }
    }

    getAll(limit = 100, offset = 0) {
        const db = getDb();
        return db.prepare(`
            SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at,
                   u.email as user_email, u.name as user_name, u.role as user_role
            FROM audit_logs a
            LEFT JOIN users u ON u.id = a.user_id
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);
    }

    count() {
        const db = getDb();
        return db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
    }
}

module.exports = new AuditModel();

