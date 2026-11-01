const { getDb } = require('../config/db');

class UserModel {
    findByEmail(email) {
        const db = getDb();
        return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    }

    findById(id) {
        const db = getDb();
        return db.prepare('SELECT id, email, role, name, avatar_url, phone, preferences, is_active, created_at, updated_at, clerk_id FROM users WHERE id = ?').get(id);
    }

    findByClerkId(clerkId) {
        if (!clerkId) return null;
        const db = getDb();
        return db.prepare('SELECT id, email, role, name, avatar_url, phone, preferences, is_active, created_at, updated_at, clerk_id FROM users WHERE clerk_id = ?').get(clerkId);
    }

    linkClerkId(userId, clerkId) {
        const db = getDb();
        db.prepare('UPDATE users SET clerk_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(clerkId, userId);
        return this.findById(userId);
    }

    create({ email, passwordHash = null, name, role = 'USER', preferences = '{}', clerkId = null, avatarUrl = null }) {
        const db = getDb();
        const crypto = require('node:crypto');
        const effectiveHash = passwordHash || `CLERK_OAUTH_LOCKED_${crypto.randomBytes(16).toString('hex')}`;
        const stmt = db.prepare(`
            INSERT INTO users (email, password_hash, role, name, preferences, is_active, clerk_id, avatar_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        const res = stmt.run(
            email.trim().toLowerCase(),
            effectiveHash,
            role,
            name.trim(),
            typeof preferences === 'string' ? preferences : JSON.stringify(preferences),
            clerkId,
            avatarUrl
        );
        return this.findById(res.lastInsertRowid);
    }

    updateProfile(id, { name, phone, preferences }) {
        const db = getDb();
        const current = this.findById(id);
        if (!current) return null;

        const updatedName = name !== undefined ? name.trim() : current.name;
        const updatedPhone = phone !== undefined ? phone.trim() : current.phone;
        const updatedPrefs = preferences !== undefined 
            ? (typeof preferences === 'string' ? preferences : JSON.stringify(preferences)) 
            : current.preferences;

        db.prepare(`
            UPDATE users 
            SET name = ?, phone = ?, preferences = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(updatedName, updatedPhone, updatedPrefs, id);

        return this.findById(id);
    }

    updatePassword(id, passwordHash) {
        const db = getDb();
        db.prepare(`
            UPDATE users
            SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(passwordHash, id);
        return true;
    }

    updateRole(id, role) {
        const db = getDb();
        db.prepare(`
            UPDATE users
            SET role = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(role, id);
        return this.findById(id);
    }

    getAll(limit = 100, offset = 0) {
        const db = getDb();
        return db.prepare(`
            SELECT id, email, role, name, phone, is_active, created_at, updated_at
            FROM users
            ORDER BY id ASC
            LIMIT ? OFFSET ?
        `).all(limit, offset);
    }

    count() {
        const db = getDb();
        return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    }

    savePasswordResetToken(userId, tokenHash, expiresAt) {
        const db = getDb();
        db.prepare(`
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used)
            VALUES (?, ?, ?, 0)
        `).run(userId, tokenHash, expiresAt);
    }

    findValidResetToken(tokenHash) {
        const db = getDb();
        return db.prepare(`
            SELECT prt.*, u.email, u.id as user_id
            FROM password_reset_tokens prt
            JOIN users u ON u.id = prt.user_id
            WHERE prt.token_hash = ? AND prt.used = 0 AND prt.expires_at > CURRENT_TIMESTAMP
        `).get(tokenHash);
    }

    markResetTokenUsed(tokenId) {
        const db = getDb();
        db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(tokenId);
    }
}

module.exports = new UserModel();

