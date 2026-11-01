const crypto = require('node:crypto');
const path = require('node:path');
let bcrypt;
try {
    bcrypt = require('bcryptjs');
} catch (e) {
    bcrypt = require(path.resolve(__dirname, '../node_modules/bcryptjs'));
}

const userModel = require('../models/userModel');
const sessionModel = require('../models/sessionModel');
const cartModel = require('../models/cartModel');
const auditModel = require('../models/auditModel');

class AuthService {
    constructor() {
        this.sessionCookieName = 'mystic_session';
        this.legacySessionCookieName = 'mystic_admin_session';
        this.csrfCookieName = 'mystic_csrf';
        this.oauthStateCookieName = 'mystic_oauth_state';
    }

    getAdminEmail() {
        return (process.env.ADMIN_EMAIL || 'madam.hex@gmail.com').trim().toLowerCase();
    }

    getSessionSecret() {
        return process.env.SESSION_SECRET || 'mystic-matrix-enchanted-apothecary-session-secret-2026';
    }

    getGoogleClientId() {
        return (process.env.GOOGLE_CLIENT_ID || '').trim();
    }

    getGoogleClientSecret() {
        return (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    }

    getGoogleCallbackUrl() {
        return process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5001/api/auth/google/callback';
    }

    isGoogleOAuthConfigured() {
        const id = this.getGoogleClientId();
        const secret = this.getGoogleClientSecret();
        return Boolean(id && secret && !id.includes('your-google-client-id') && !secret.includes('your-google-client-secret'));
    }

    /**
     * Hash password using adaptive bcrypt (12 rounds)
     */
    hashPassword(plainPassword) {
        const salt = bcrypt.genSaltSync(12);
        return bcrypt.hashSync(plainPassword, salt);
    }

    /**
     * Verify password against bcrypt hash
     */
    verifyPassword(plainPassword, hash) {
        if (!plainPassword || !hash) return false;
        try {
            return bcrypt.compareSync(plainPassword, hash);
        } catch (err) {
            return false;
        }
    }

    /**
     * Register a new user (Strictly role USER for public registration)
     */
    async register({ email, password, name, phone = null, ipAddress = null }) {
        if (!email || !email.includes('@')) {
            throw new Error('Please provide a valid email address.');
        }
        if (!password || password.length < 8) {
            throw new Error('Password must be at least 8 characters long.');
        }
        if (!name || name.trim().length === 0) {
            throw new Error('Please provide your name or apprentice moniker.');
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = userModel.findByEmail(normalizedEmail);
        if (existing) {
            throw new Error('An account with this email address already exists.');
        }

        const passwordHash = this.hashPassword(password);

        // Security requirement: Never allow public registration to select ADMIN role
        const user = userModel.create({
            email: normalizedEmail,
            passwordHash,
            name: name.trim(),
            role: 'USER', // FORCED ROLE USER
            preferences: { theme: 'night', notifications: true }
        });

        // Initialize empty shopping cart for user
        cartModel.getOrCreateCart(user.id);

        auditModel.log({
            userId: user.id,
            action: 'USER_REGISTERED',
            entityType: 'USER',
            entityId: user.id,
            details: { email: user.email, role: 'USER' },
            ipAddress
        });

        // Establish session on registration
        const session = this.createSession(user.id, ipAddress);

        return {
            user: this.sanitizeUser(user),
            session
        };
    }

    /**
     * Login user with email & password
     */
    async login({ email, password, ipAddress = null, userAgent = null }) {
        if (!email || !password) {
            throw new Error('Invalid email or password.');
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = userModel.findByEmail(normalizedEmail);

        if (!user || !user.is_active) {
            auditModel.log({
                action: 'LOGIN_FAILED',
                entityType: 'AUTH',
                details: { email: normalizedEmail, reason: 'USER_NOT_FOUND_OR_INACTIVE' },
                ipAddress
            });
            throw new Error('Invalid email or password.');
        }

        const match = this.verifyPassword(password, user.password_hash);
        if (!match) {
            auditModel.log({
                userId: user.id,
                action: 'LOGIN_FAILED',
                entityType: 'AUTH',
                details: { email: normalizedEmail, reason: 'INVALID_PASSWORD' },
                ipAddress
            });
            throw new Error('Invalid email or password.');
        }

        // Establish new session (Session regeneration on login)
        const session = this.createSession(user.id, ipAddress, userAgent);

        auditModel.log({
            userId: user.id,
            action: `${user.role}_LOGIN_SUCCESS`,
            entityType: 'SESSION',
            entityId: session.id,
            details: { email: user.email, role: user.role },
            ipAddress
        });

        return {
            user: this.sanitizeUser(user),
            session
        };
    }

    /**
     * Create server-side session in database
     */
    createSession(userId, ipAddress = null, userAgent = null) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const csrfToken = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        sessionModel.create({
            id: sessionId,
            userId,
            csrfToken,
            ipAddress,
            userAgent,
            expiresAt
        });

        return {
            id: sessionId,
            csrf_token: csrfToken,
            expires_at: expiresAt
        };
    }

    /**
     * Verify session by session ID from database
     */
    verifySession(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') return null;

        const session = sessionModel.findById(sessionId);
        if (!session) {
            return null;
        }

        let preferences = {};
        try {
            preferences = typeof session.preferences === 'string' ? JSON.parse(session.preferences) : (session.preferences || {});
        } catch (e) {
            preferences = {};
        }

        return {
            id: session.user_id,
            email: session.email,
            role: session.role,
            name: session.name,
            avatar_url: session.avatar_url,
            phone: session.phone,
            preferences,
            session_id: session.id,
            csrf_token: session.csrf_token
        };
    }

    /**
     * Logout and destroy session
     */
    logout(sessionId, userId = null, ipAddress = null) {
        if (sessionId) {
            sessionModel.delete(sessionId);
        }
        if (userId) {
            auditModel.log({
                userId,
                action: 'LOGOUT',
                entityType: 'SESSION',
                entityId: sessionId,
                details: { sessionId },
                ipAddress
            });
        }
    }

    /**
     * Request Password Reset (generates single-use expiring token)
     */
    requestPasswordReset(email, ipAddress = null) {
        if (!email) {
            return {
                success: true,
                message: 'If that email exists in Madam Hex\'s grimoire, reset instructions have been dispatched.'
            };
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = userModel.findByEmail(normalizedEmail);

        if (!user) {
            return {
                success: true,
                message: 'If that email exists in Madam Hex\'s grimoire, reset instructions have been dispatched.'
            };
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

        userModel.savePasswordResetToken(user.id, tokenHash, expiresAt);

        auditModel.log({
            userId: user.id,
            action: 'PASSWORD_RESET_REQUESTED',
            entityType: 'USER',
            entityId: user.id,
            details: { email: user.email },
            ipAddress
        });

        return {
            success: true,
            message: 'If that email exists in Madam Hex\'s grimoire, reset instructions have been dispatched.',
            // Provided in development/demo for testing reset workflow
            devToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined
        };
    }

    /**
     * Reset password using single-use expiring token
     */
    resetPassword(token, newPassword, ipAddress = null) {
        if (!token) throw new Error('Password reset token is required.');
        if (!newPassword || newPassword.length < 8) {
            throw new Error('New password must be at least 8 characters long.');
        }

        const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
        const record = userModel.findValidResetToken(tokenHash);

        if (!record) {
            throw new Error('The password reset spell token is invalid or has expired.');
        }

        const newHash = this.hashPassword(newPassword);
        userModel.updatePassword(record.user_id, newHash);
        userModel.markResetTokenUsed(record.id);

        // Security best practice: invalidate all active sessions for this user
        sessionModel.deleteForUser(record.user_id);

        auditModel.log({
            userId: record.user_id,
            action: 'PASSWORD_RESET_SUCCESSFUL',
            entityType: 'USER',
            entityId: record.user_id,
            details: { email: record.email },
            ipAddress
        });

        return {
            success: true,
            message: 'Your magical password has been successfully renewed. Please sign in with your new credentials.'
        };
    }

    /**
     * Update user profile
     */
    updateProfile(userId, { name, phone, preferences }, ipAddress = null) {
        const updated = userModel.updateProfile(userId, { name, phone, preferences });
        if (!updated) throw new Error('User not found');

        auditModel.log({
            userId,
            action: 'PROFILE_UPDATED',
            entityType: 'USER',
            entityId: userId,
            details: { name, phone },
            ipAddress
        });

        return this.sanitizeUser(updated);
    }

    /**
     * Change password for logged-in user
     */
    changePassword(userId, currentPassword, newPassword, ipAddress = null) {
        const user = userModel.findById(userId);
        if (!user) throw new Error('User not found');

        const fullUser = userModel.findByEmail(user.email);
        const match = this.verifyPassword(currentPassword, fullUser.password_hash);
        if (!match) {
            throw new Error('Current password does not match our records.');
        }

        if (!newPassword || newPassword.length < 8) {
            throw new Error('New password must be at least 8 characters long.');
        }

        const newHash = this.hashPassword(newPassword);
        userModel.updatePassword(userId, newHash);

        auditModel.log({
            userId,
            action: 'PASSWORD_CHANGED',
            entityType: 'USER',
            entityId: userId,
            ipAddress
        });

        return {
            success: true,
            message: 'Password successfully changed.'
        };
    }

    sanitizeUser(user) {
        let preferences = {};
        try {
            preferences = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : (user.preferences || {});
        } catch (e) {
            preferences = {};
        }

        return {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
            avatar_url: user.avatar_url,
            phone: user.phone,
            preferences,
            created_at: user.created_at
        };
    }

    // --- Google OAuth Methods (Preserved for when Google Cloud credentials are provided) ---

    generateGoogleAuthUrl() {
        if (!this.isGoogleOAuthConfigured()) {
            throw new Error('Google OAuth credentials are not configured in .env');
        }

        const state = crypto.randomBytes(24).toString('hex');
        const params = new URLSearchParams({
            client_id: this.getGoogleClientId(),
            redirect_uri: this.getGoogleCallbackUrl(),
            response_type: 'code',
            scope: 'openid email profile',
            state: state,
            access_type: 'online',
            prompt: 'select_account'
        });

        return {
            url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
            state
        };
    }

    async handleGoogleCallback(code) {
        if (!code) throw new Error('Authorization code is missing');

        const tokenUrl = 'https://oauth2.googleapis.com/token';
        const params = new URLSearchParams({
            code,
            client_id: this.getGoogleClientId(),
            client_secret: this.getGoogleClientSecret(),
            redirect_uri: this.getGoogleCallbackUrl(),
            grant_type: 'authorization_code'
        });

        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || 'Failed to exchange authorization code with Google');
        }

        const userinfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const profile = await userinfoRes.json();
        if (!userinfoRes.ok || !profile.email) {
            throw new Error('Failed to retrieve user profile from Google');
        }

        const email = profile.email.toLowerCase().trim();
        let user = userModel.findByEmail(email);

        if (!user) {
            // New user via Google OAuth -> USER role (unless matching ADMIN_EMAIL)
            const isAdmin = email === this.getAdminEmail();
            const randomPassword = crypto.randomBytes(24).toString('hex');
            user = userModel.create({
                email,
                passwordHash: this.hashPassword(randomPassword),
                name: profile.name || 'Arcane Traveler',
                role: isAdmin ? 'ADMIN' : 'USER',
                preferences: { theme: 'night' }
            });
            cartModel.getOrCreateCart(user.id);
        }

        return user;
    }
}

module.exports = new AuthService();
