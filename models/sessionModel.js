const { getDb } = require('../config/db');

class SessionModel {
    create({ id, userId, csrfToken, ipAddress, userAgent, expiresAt }) {
        const db = getDb();
        db.prepare(`
            INSERT INTO sessions (id, user_id, csrf_token, ip_address, user_agent, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, userId, csrfToken, ipAddress || null, userAgent || null, expiresAt);
        return this.findById(id);
    }

    findById(id) {
        if (!id) return null;
        const db = getDb();
        return db.prepare(`
            SELECT s.id, s.user_id, s.csrf_token, s.expires_at, s.created_at,
                   u.email, u.role, u.name, u.avatar_url, u.phone, u.preferences, u.is_active
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1
        `).get(id);
    }

    delete(id) {
        if (!id) return;
        const db = getDb();
        db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    }

    deleteForUser(userId) {
        const db = getDb();
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    }

    cleanExpired() {
        const db = getDb();
        db.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
    }
}

module.exports = new SessionModel();

