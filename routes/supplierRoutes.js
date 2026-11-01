const express = require('express');
const router = express.Router();
const SupplierController = require('../controllers/supplierController');

router.get('/', SupplierController.getAll);
router.get('/purchase-orders', SupplierController.getPurchaseOrders);
router.post('/purchase-orders/:id/receive', SupplierController.receivePurchaseOrder);

module.exports = router;
