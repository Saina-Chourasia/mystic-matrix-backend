/**
 * MYSTIC MATRIX AI Agent Routes
 * Mounted at /api/ai (Requires Admin Authentication)
 */

const express = require('express');
const router = express.Router();
const AiNotificationController = require('../controllers/aiNotificationController');
const AiActionController = require('../controllers/aiActionController');
const AiChatController = require('../controllers/aiChatController');
const AiMonitoringService = require('../services/aiMonitoringService');
const AiAgentService = require('../services/aiAgentService');

// --- AI Notification Endpoints ---
router.get('/notifications', AiNotificationController.getNotifications);
router.get('/notifications/stats', AiNotificationController.getStats);
router.patch('/notifications/:id/read', AiNotificationController.markRead);
router.patch('/notifications/:id/dismiss', AiNotificationController.dismiss);
router.post('/notifications/read-all', AiNotificationController.markAllRead);
router.post('/analyze', AiNotificationController.triggerScan);

// --- Level 3 Action Approval Endpoints ---
router.get('/actions', AiActionController.getActions);
router.post('/actions/draft', AiActionController.createDraft);
router.post('/actions/:id/approve', AiActionController.approve);
router.post('/actions/:id/reject', AiActionController.reject);

// --- Conversational Oracle Chat Endpoints ---
router.post('/chat', AiChatController.sendMessage);
router.get('/chat/history/:sessionId', AiChatController.getHistory);
router.post('/chat/clear/:sessionId', AiChatController.clearHistory);

// --- Deterministic Mathematical Insights Endpoints ---
router.get('/restock-details/:productId', (req, res, next) => {
    try {
        const details = AiMonitoringService.calculateRestockDetails(req.params.productId);
        res.json({ success: true, details });
    } catch (err) {
        next(err);
    }
});

router.get('/assortment-rankings', (req, res, next) => {
    try {
        const rankings = AiMonitoringService.getProductRankingsAndAssortment();
        res.json({ success: true, count: rankings.length, rankings });
    } catch (err) {
        next(err);
    }
});

// --- AI Diagnostics Endpoints (Admin Only) ---
router.get('/diagnostics', async (req, res, next) => {
    try {
        const diagnostics = await AiAgentService.getDiagnostics();
        res.json({ success: true, diagnostics });
    } catch (err) {
        next(err);
    }
});

router.post('/diagnostics/ping', async (req, res, next) => {
    try {
        const pingResult = await AiAgentService.pingProvider();
        res.json({ success: true, ping: pingResult });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

