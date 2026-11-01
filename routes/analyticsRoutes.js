const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/analyticsController');

router.get('/dashboard', AnalyticsController.getDashboardMetrics);
router.get('/sales', AnalyticsController.getSalesAnalytics);
router.post('/reset-demo', AnalyticsController.resetDemoData);

module.exports = router;

