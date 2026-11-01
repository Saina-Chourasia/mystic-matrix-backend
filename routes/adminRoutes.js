const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin, verifyCsrfToken } = require('../middleware/authMiddleware');

// All Admin routes strictly enforce requireAdmin
router.use(requireAdmin);
router.use(verifyCsrfToken);

router.get('/dashboard', adminController.getDashboard);
router.get('/orders', adminController.getOrders);
router.get('/orders/:id', adminController.getOrderById);
router.get('/users', adminController.getUsers);
router.patch('/users/:id', adminController.updateUser);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/datasets', adminController.getDatasets);
router.post('/datasets/import', adminController.triggerImport);
router.get('/datasets/retail', adminController.getRetailTransactions);
router.get('/datasets/daily-demand', adminController.getDailyDemand);

module.exports = router;

