const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (e) {
    rateLimit = null;
}

// Rate limiter for authentication actions (15 attempts per 15 minutes)
const authLimiter = rateLimit ? rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts. Please pause your incantations and try again in 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false
}) : (req, res, next) => next();

// Public Auth Endpoints
router.get('/config', authController.getConfig);
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Clerk Authentication Sync Endpoint
router.post('/clerk-sync', authController.handleClerkSync);

// Google OAuth Endpoints
router.get('/google', authController.initiateGoogleAuth);
router.get('/google/callback', authController.handleGoogleCallback);

// Dev / Testing Helper (verifies provisioned accounts)
router.post('/dev-login', authController.devLogin);

module.exports = router;
