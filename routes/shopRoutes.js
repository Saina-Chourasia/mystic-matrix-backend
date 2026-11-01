const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');

// Public customer product catalog & discovery
router.get('/products', shopController.getProducts);
router.get('/products/:id', shopController.getProductById);
router.get('/featured', shopController.getFeatured);

module.exports = router;

