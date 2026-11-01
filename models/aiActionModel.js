/**
 * MYSTIC MATRIX AI Action Approvals Model
 * Level 3 Action Safety Guardrail: AI can propose actions, but explicit
 * human admin approval is strictly required before modifying database state.
 */

const { getDb } = require('../config/db');

class AiActionModel {
    /**
     * Create a proposed draft action
     */
    static createDraft({ action_type, target_entity, title, proposed_payload, justification, requested_by = 'Mystic AI Oracle' }) {
        const db = getDb();
        const payloadStr = typeof proposed_payload === 'object' ? JSON.stringify(proposed_payload) : proposed_payload;

        const stmt = db.prepare(`
            INSERT INTO ai_action_approvals (
                action_type, target_entity, title, proposed_payload, justification, status, requested_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        const result = stmt.run(action_type, target_entity, title, payloadStr, justification, requested_by);
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Get action approval by ID
     */
    static getById(id) {
        const db = getDb();
        const row = db.prepare('SELECT * FROM ai_action_approvals WHERE id = ?').get(id);
        if (!row) return null;
        return {
            ...row,
            proposed_payload: JSON.parse(row.proposed_payload || '{}')
        };
    }

    /**
     * Get all action approvals with optional status filter
     */
    static getAll({ status = null, limit = 50, offset = 0 } = {}) {
        const db = getDb();
        let sql = 'SELECT * FROM ai_action_approvals';
        const params = [];

        if (status && status !== 'ALL') {
            sql += ' WHERE status = ?';
            params.push(status.toUpperCase());
        }

        sql += ' ORDER BY CASE status WHEN \'PENDING\' THEN 1 WHEN \'APPROVED\' THEN 2 ELSE 3 END ASC, created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const rows = db.prepare(sql).all(...params);
        return rows.map(r => ({
            ...r,
            proposed_payload: JSON.parse(r.proposed_payload || '{}')
        }));
    }

    /**
     * Mark an action approval as approved and execute it
     */
    static markApproved(id, approvedBy) {
        const db = getDb();
        db.prepare(`
            UPDATE ai_action_approvals 
            SET status = 'APPROVED', approved_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(approvedBy, id);
        return this.getById(id);
    }

    /**
     * Mark an action approval as executed
     */
    static markExecuted(id) {
        const db = getDb();
        db.prepare(`
            UPDATE ai_action_approvals 
            SET status = 'EXECUTED', executed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(id);
        return this.getById(id);
    }

    /**
     * Reject an action proposal
     */
    static reject(id, reason, approvedBy) {
        const db = getDb();
        db.prepare(`
            UPDATE ai_action_approvals 
            SET status = 'REJECTED', rejection_reason = ?, approved_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(reason, approvedBy, id);
        return this.getById(id);
    }
}

module.exports = AiActionModel;

