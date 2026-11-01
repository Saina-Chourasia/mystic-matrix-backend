const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { requireAuth, verifyCsrfToken } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(verifyCsrfToken);

router.get('/', profileController.getProfile);
router.patch('/', profileController.updateProfile);
router.post('/change-password', profileController.changePassword);

module.exports = router;

