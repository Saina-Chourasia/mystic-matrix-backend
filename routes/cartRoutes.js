const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { requireAuth, verifyCsrfToken } = require('../middleware/authMiddleware');

// All cart routes require active authenticated session
router.use(requireAuth);
router.use(verifyCsrfToken);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.patch('/items/:id', cartController.updateItem);
router.delete('/items/:id', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;

