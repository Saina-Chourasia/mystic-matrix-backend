/**
 * MYSTIC MATRIX AI Chat Controller
 * Manages conversational sessions between Madam Hex and Mystic AI — The Inventory Oracle.
 */

const AiChatModel = require('../models/aiChatModel');
const AiActionModel = require('../models/aiActionModel');
const AiAgentService = require('../services/aiAgentService');

class AiChatController {
    /**
     * Send message to the Oracle
     */
    static async sendMessage(req, res, next) {
        try {
            const { message, sessionId: incomingSessionId } = req.body;
            if (!message || message.trim() === '') {
                return res.status(400).json({ success: false, message: 'Message text is required.' });
            }

            const sessionId = incomingSessionId || `session-oracle-${Date.now()}`;
            const userId = req.user ? req.user.id : null;

            // Ensure session exists
            AiChatModel.getOrCreateSession(sessionId, 'Consulting the Inventory Oracle', userId);

            // Fetch recent history
            const history = AiChatModel.getMessages(sessionId, 10);

            // Save user message
            AiChatModel.addMessage({
                sessionId,
                role: 'user',
                content: message
            });

            // Process query through Agent (Gemini or Heuristic Fallback)
            const result = await AiAgentService.processQuery(message, history, req.user || {});

            // Register any proposed Level 3 actions in the database so they have persistent IDs
            const persistedActions = [];
            if (result.suggestedActions && result.suggestedActions.length > 0) {
                for (const act of result.suggestedActions) {
                    try {
                        const createdDraft = AiActionModel.createDraft({
                            action_type: act.action_type,
                            target_entity: act.target_entity,
                            title: act.title,
                            proposed_payload: act.proposed_payload,
                            justification: act.justification,
                            requested_by: 'Mystic AI Oracle'
                        });
                        persistedActions.push(createdDraft);
                    } catch (draftErr) {
                        console.warn('[AI Chat] Could not persist draft action:', draftErr.message);
                    }
                }
            }

            // Save assistant message
            AiChatModel.addMessage({
                sessionId,
                role: 'assistant',
                content: result.response,
                tool_calls: result.toolsUsed,
                tool_results: result.toolResults,
                suggested_actions: persistedActions
            });

            res.json({
                success: true,
                sessionId,
                message: result.response,
                toolsUsed: result.toolsUsed,
                toolResults: result.toolResults,
                suggestedActions: persistedActions,
                provider: result.provider,
                model: result.model,
                fallbackReason: result.fallbackReason || null
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Retrieve chat history
     */
    static getHistory(req, res, next) {
        try {
            const { sessionId } = req.params;
            const messages = AiChatModel.getMessages(sessionId, 50);
            res.json({ success: true, sessionId, messages });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Clear chat history
     */
    static clearHistory(req, res, next) {
        try {
            const { sessionId } = req.params;
            AiChatModel.clearSession(sessionId);
            res.json({ success: true, message: `Chat session ${sessionId} cleared.` });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = AiChatController;

