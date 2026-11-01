const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { requireAuth, verifyCsrfToken } = require('../middleware/authMiddleware');

// All order routes require authenticated session
router.use(requireAuth);
router.use(verifyCsrfToken);

router.post('/', orderController.createOrder);
router.get('/my', orderController.getMyOrders);
router.get('/:id', orderController.getOrderById);

module.exports = router;

