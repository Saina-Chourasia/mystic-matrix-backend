const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/productController');

// Valuation endpoint (before /:id param route)
router.get('/valuation', ProductController.getValuation);

router.get('/', ProductController.getAll);
router.get('/:id', ProductController.getById);
router.get('/:id/transactions', ProductController.getTransactions);
router.post('/', ProductController.create);
router.put('/:id', ProductController.update);
router.patch('/:id', ProductController.update);
router.delete('/:id', ProductController.delete);
router.post('/:id/archive', ProductController.archive);
router.post('/:id/adjust-stock', ProductController.adjustStock);

module.exports = router;
