const path = require('node:path');
const fs = require('node:fs');
const AnalyticsService = require('../services/analyticsService');
const { getDb } = require('../config/db');

const seedModulePath = fs.existsSync(path.resolve(__dirname, '../database/seed/seedData.js'))
    ? path.resolve(__dirname, '../database/seed/seedData.js')
    : path.resolve(__dirname, '../../database/seed/seedData.js');
const { seedData } = require(seedModulePath);

class AnalyticsController {
    static getDashboardMetrics(req, res) {
        try {
            const { halloweenMultiplier } = req.query;
            const options = {
                halloweenMultiplierSetting: halloweenMultiplier ? parseFloat(halloweenMultiplier) : 1.0
            };
            const metrics = AnalyticsService.getDashboardMetrics(options);
            res.json({ success: true, data: metrics });
        } catch (error) {
            console.error('Dashboard metrics error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static getSalesAnalytics(req, res) {
        try {
            const { days } = req.query;
            const analytics = AnalyticsService.getSalesAnalytics(days ? parseInt(days, 10) : 30);
            res.json({ success: true, data: analytics });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static resetDemoData(req, res) {
        try {
            const db = getDb();
            seedData(db);
            res.json({
                success: true,
                message: 'Madam Hex\'s shop data has been magically reset to baseline seed state.'
            });
        } catch (error) {
            console.error('Reset data error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = AnalyticsController;

