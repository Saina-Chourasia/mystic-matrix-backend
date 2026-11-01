/**
 * MYSTIC MATRIX AI Chat Model
 * Manages conversational history and structured tool calls between Madam Hex and the Oracle.
 */

const { getDb } = require('../config/db');

class AiChatModel {
    /**
     * Create or retrieve an active session
     */
    static getOrCreateSession(sessionId, title = 'Consulting the Oracle', userId = null) {
        const db = getDb();
        const existing = db.prepare('SELECT * FROM ai_chat_sessions WHERE id = ?').get(sessionId);
        if (existing) {
            return existing;
        }

        db.prepare(`
            INSERT INTO ai_chat_sessions (id, user_id, title, created_at, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(sessionId, userId, title);

        return db.prepare('SELECT * FROM ai_chat_sessions WHERE id = ?').get(sessionId);
    }

    /**
     * Append a message to the chat history
     */
    static addMessage({ sessionId, role, content, tool_calls = null, tool_results = null, suggested_actions = null }) {
        const db = getDb();
        const toolCallsStr = tool_calls ? (typeof tool_calls === 'string' ? tool_calls : JSON.stringify(tool_calls)) : null;
        const toolResultsStr = tool_results ? (typeof tool_results === 'string' ? tool_results : JSON.stringify(tool_results)) : null;
        const actionsStr = suggested_actions ? (typeof suggested_actions === 'string' ? suggested_actions : JSON.stringify(suggested_actions)) : null;

        const stmt = db.prepare(`
            INSERT INTO ai_chat_messages (
                session_id, role, content, tool_calls, tool_results, suggested_actions, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        const result = stmt.run(sessionId, role, content, toolCallsStr, toolResultsStr, actionsStr);

        // Update session's updated_at
        db.prepare('UPDATE ai_chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);

        return result.lastInsertRowid;
    }

    /**
     * Retrieve messages for a given session
     */
    static getMessages(sessionId, limit = 50) {
        const db = getDb();
        const rows = db.prepare(`
            SELECT * FROM ai_chat_messages
            WHERE session_id = ?
            ORDER BY created_at ASC, id ASC
            LIMIT ?
        `).all(sessionId, parseInt(limit, 10));

        return rows.map(r => ({
            ...r,
            tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : null,
            tool_results: r.tool_results ? JSON.parse(r.tool_results) : null,
            suggested_actions: r.suggested_actions ? JSON.parse(r.suggested_actions) : null
        }));
    }

    /**
     * Clear messages for a given session
     */
    static clearSession(sessionId) {
        const db = getDb();
        db.prepare('DELETE FROM ai_chat_messages WHERE session_id = ?').run(sessionId);
        return true;
    }
}

module.exports = AiChatModel;

