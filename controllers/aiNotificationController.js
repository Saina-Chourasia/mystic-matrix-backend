/**
 * MYSTIC MATRIX AI Notification Controller
 */

const AiNotificationModel = require('../models/aiNotificationModel');
const AiMonitoringService = require('../services/aiMonitoringService');

class AiNotificationController {
    /**
     * Get notifications with filter
     */
    static getNotifications(req, res, next) {
        try {
            const { severity, unreadOnly, limit = 50, offset = 0 } = req.query;
            const notifications = AiNotificationModel.getAll({
                severity,
                unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10)
            });
            const stats = AiNotificationModel.getStats();

            res.json({
                success: true,
                stats,
                notifications
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Get notification summary stats
     */
    static getStats(req, res, next) {
        try {
            const stats = AiNotificationModel.getStats();
            res.json({ success: true, stats });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Mark single notification as read
     */
    static markRead(req, res, next) {
        try {
            const { id } = req.params;
            AiNotificationModel.markAsRead(id);
            res.json({ success: true, message: `Notification #${id} marked as read.` });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Mark all active notifications as read
     */
    static markAllRead(req, res, next) {
        try {
            AiNotificationModel.markAllAsRead();
            res.json({ success: true, message: 'All notifications marked as read.' });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Dismiss a notification
     */
    static dismiss(req, res, next) {
        try {
            const { id } = req.params;
            AiNotificationModel.dismiss(id);
            res.json({ success: true, message: `Notification #${id} dismissed.` });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Trigger immediate inventory audit scan
     */
    static triggerScan(req, res, next) {
        try {
            const result = AiMonitoringService.runFullInventoryScan('MANUAL');
            const stats = AiNotificationModel.getStats();
            res.json({
                success: true,
                message: result.summary,
                scanResult: result,
                stats
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = AiNotificationController;

