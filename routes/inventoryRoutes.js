const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/productController');
const TransactionModel = require('../models/transactionModel');

// POST /api/inventory/adjustments
router.post('/adjustments', ProductController.adjustStock);

// GET /api/inventory/valuation
router.get('/valuation', ProductController.getValuation);

// GET /api/inventory/transactions
router.get('/transactions', (req, res) => {
    try {
        const { productId, limit } = req.query;
        const txs = TransactionModel.getAll({ 
            productId: productId ? parseInt(productId, 10) : undefined, 
            limit: limit ? parseInt(limit, 10) : 50 
        });
        res.json({ success: true, count: txs.length, data: txs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;

