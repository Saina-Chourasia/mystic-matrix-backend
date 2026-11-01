const express = require('express');
const router = express.Router();
const SalesController = require('../controllers/salesController');

router.get('/', SalesController.getAll);
router.post('/', SalesController.create);
router.get('/transactions', SalesController.getTransactions);

module.exports = router;

