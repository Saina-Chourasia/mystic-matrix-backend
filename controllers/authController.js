const authService = require('../services/authService');

function getCookieConfig(isHttpOnly = true) {
    const isProduction = process.env.NODE_ENV === 'production';
    const isCrossDomain = Boolean(process.env.FRONTEND_URL || process.env.COOKIE_SAME_SITE === 'none');

    return {
        httpOnly: isHttpOnly,
        secure: isProduction || isCrossDomain,
        sameSite: isCrossDomain ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
    };
}

class AuthController {
    /**
     * Get Public Auth Configuration
     */
    getConfig(req, res) {
        const isConfigured = authService.isGoogleOAuthConfigured();
        const clientId = authService.getGoogleClientId();
        const adminEmail = authService.getAdminEmail();
        const clerkService = require('../services/clerkService');
        const isClerkConfigured = clerkService.isConfigured();
        const clerkPublishableKey = clerkService.getPublishableKey();

        const [user, domain] = adminEmail.split('@');
        const masked = user && user.length > 2 
            ? `${user[0]}***${user[user.length - 1]}@${domain}` 
            : `${user}@${domain}`;

        res.json({
            success: true,
            data: {
                googleConfigured: isConfigured,
                clientId: isConfigured ? clientId : null,
                adminEmailMasked: masked,
                callbackUrl: authService.getGoogleCallbackUrl(),
                // Clerk Authentication Configuration
                clerkConfigured: isClerkConfigured,
                clerkPublishableKey: clerkPublishableKey || null,
                authProvider: isClerkConfigured ? 'clerk' : 'native'
            }
        });
    }

    /**
     * Customer & Apprentice Public Registration (Strictly creates role USER)
     */
    async register(req, res) {
        try {
            const { email, password, name, phone } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;

            const { user, session } = await authService.register({
                email,
                password,
                name,
                phone,
                ipAddress
            });

            // Set secure, HTTP-only session cookie
            res.cookie(authService.sessionCookieName, session.id, getCookieConfig(true));

            // Set CSRF token cookie for frontend mutation headers
            res.cookie('mystic_csrf', session.csrf_token, getCookieConfig(false));

            res.status(201).json({
                success: true,
                message: `Welcome to Madam Hex's Emporium, ${user.name}!`,
                user,
                csrfToken: session.csrf_token
            });
        } catch (err) {
            res.status(400).json({
                success: false,
                error: 'REGISTRATION_FAILED',
                message: err.message || 'Registration could not be completed.'
            });
        }
    }

    /**
     * Secure Login (Both ADMIN and USER accounts)
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'] || null;

            const { user, session } = await authService.login({
                email,
                password,
                ipAddress,
                userAgent
            });

            // Set secure, HTTP-only session cookie
            res.cookie(authService.sessionCookieName, session.id, getCookieConfig(true));

            // Set backward compatible cookie for legacy checks
            res.cookie(authService.legacySessionCookieName, session.id, getCookieConfig(true));

            // Set CSRF token cookie
            res.cookie('mystic_csrf', session.csrf_token, getCookieConfig(false));

            res.json({
                success: true,
                message: `Successfully authenticated as ${user.name} (${user.role})`,
                user,
                csrfToken: session.csrf_token
            });
        } catch (err) {
            res.status(401).json({
                success: false,
                error: 'INVALID_CREDENTIALS',
                message: err.message || 'Invalid email or password.'
            });
        }
    }

    /**
     * Check Current Session / Profile (/api/auth/me)
     */
    getMe(req, res) {
        let sessionId = null;
        if (req.cookies) {
            sessionId = req.cookies[authService.sessionCookieName] || req.cookies[authService.legacySessionCookieName];
        }
        if (!sessionId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            sessionId = req.headers.authorization.substring(7).trim();
        }

        if (!sessionId) {
            return res.json({
                success: true,
                authenticated: false,
                user: null
            });
        }

        const user = authService.verifySession(sessionId);
        if (!user) {
            res.clearCookie(authService.sessionCookieName, { path: '/' });
            res.clearCookie(authService.legacySessionCookieName, { path: '/' });
            res.clearCookie('mystic_csrf', { path: '/' });
            return res.json({
                success: true,
                authenticated: false,
                user: null
            });
        }

        res.json({
            success: true,
            authenticated: true,
            user,
            csrfToken: user.csrf_token
        });
    }

    /**
     * Logout & Terminate Session
     */
    logout(req, res) {
        let sessionId = null;
        if (req.cookies) {
            sessionId = req.cookies[authService.sessionCookieName] || req.cookies[authService.legacySessionCookieName];
        }
        const userId = req.user ? req.user.id : null;
        const ipAddress = req.ip || req.connection.remoteAddress;

        authService.logout(sessionId, userId, ipAddress);

        res.clearCookie(authService.sessionCookieName, { path: '/' });
        res.clearCookie(authService.legacySessionCookieName, { path: '/' });
        res.clearCookie('mystic_csrf', { path: '/' });

        res.json({
            success: true,
            message: "Successfully signed out of Madam Hex's private apothecary."
        });
    }

    /**
     * Request Password Reset Token
     */
    forgotPassword(req, res) {
        try {
            const { email } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const result = authService.requestPasswordReset(email, ipAddress);
            res.json(result);
        } catch (err) {
            res.status(400).json({
                success: false,
                error: 'RESET_REQUEST_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Reset Password using Token
     */
    resetPassword(req, res) {
        try {
            const { token, newPassword } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const result = authService.resetPassword(token, newPassword, ipAddress);
            res.json(result);
        } catch (err) {
            res.status(400).json({
                success: false,
                error: 'RESET_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Dev / Testing Quick-Login (Strictly verifies against provisioned database accounts)
     */
    async devLogin(req, res) {
        try {
            const { email, password } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'] || null;

            if (!email) {
                return res.status(400).json({ success: false, message: 'Email address is required' });
            }

            // If no password provided in dev-login, check default credentials for test accounts
            let passToUse = password;
            if (!passToUse) {
                if (email.toLowerCase() === 'apprentice@hallowmere.com') {
                    passToUse = 'Hallowmere2026!Spell';
                } else {
                    return res.status(403).json({
                        success: false,
                        error: 'ACCESS_DENIED',
                        message: "Access Denied! Password required for this account.",
                        attemptedEmail: email
                    });
                }
            }

            const { user, session } = await authService.login({
                email,
                password: passToUse,
                ipAddress,
                userAgent
            });

            res.cookie(authService.sessionCookieName, session.id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });
            res.cookie(authService.legacySessionCookieName, session.id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });
            res.cookie('mystic_csrf', session.csrf_token, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });

            res.json({
                success: true,
                message: `Authorized session established for ${user.name} (${user.role})`,
                user,
                csrfToken: session.csrf_token
            });
        } catch (err) {
            res.status(403).json({
                success: false,
                error: 'ACCESS_DENIED',
                message: err.message || "Access Denied! You are not authorized to enter Madam Hex's magical shop.",
                attemptedEmail: req.body.email
            });
        }
    }

    /**
     * Initiate Google OAuth
     */
    initiateGoogleAuth(req, res) {
        try {
            if (!authService.isGoogleOAuthConfigured()) {
                return res.redirect('/login?error=not_configured');
            }

            const { url, state } = authService.generateGoogleAuthUrl();

            res.cookie(authService.oauthStateCookieName, state, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 10 * 60 * 1000,
                path: '/'
            });

            res.redirect(url);
        } catch (err) {
            res.redirect('/login?error=oauth_init_failed');
        }
    }

    /**
     * Google OAuth Callback
     */
    async handleGoogleCallback(req, res) {
        const { code, state, error } = req.query;

        if (error) {
            return res.redirect(`/login?error=${encodeURIComponent(error)}`);
        }

        const savedState = req.cookies && req.cookies[authService.oauthStateCookieName];
        res.clearCookie(authService.oauthStateCookieName, { path: '/' });

        if (!state || !savedState || state !== savedState) {
            return res.redirect('/login?error=state_mismatch');
        }

        try {
            const user = await authService.handleGoogleCallback(code);
            const session = authService.createSession(user.id, req.ip);

            res.cookie(authService.sessionCookieName, session.id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });
            res.cookie(authService.legacySessionCookieName, session.id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });
            res.cookie('mystic_csrf', session.csrf_token, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });

            if (user.role === 'ADMIN') {
                return res.redirect('/admin/dashboard?auth=success');
            } else {
                return res.redirect('/user/dashboard?auth=success');
            }
        } catch (err) {
            return res.redirect(`/login?error=oauth_exchange_failed&msg=${encodeURIComponent(err.message)}`);
        }
    }

    /**
     * Synchronize Clerk authenticated session with SQLite database
     */
    async handleClerkSync(req, res) {
        try {
            const { clerkId, email, name, avatarUrl, token } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'] || null;

            if (!clerkId || !email) {
                return res.status(400).json({
                    success: false,
                    error: 'MISSING_FIELDS',
                    message: 'clerkId and email are required for Clerk synchronization.'
                });
            }

            const clerkService = require('../services/clerkService');
            const { user, session } = await clerkService.syncClerkUser({
                clerkId,
                email,
                name,
                avatarUrl,
                token,
                ipAddress,
                userAgent
            });

            // Set secure session cookies for seamless session continuity
            res.cookie(authService.sessionCookieName, session.id, getCookieConfig(true));
            res.cookie(authService.legacySessionCookieName, session.id, getCookieConfig(true));
            res.cookie('mystic_csrf', session.csrf_token, getCookieConfig(false));

            res.json({
                success: true,
                message: `Clerk session synchronized for ${user.name} (${user.role})`,
                user,
                sessionId: session.id,
                csrfToken: session.csrf_token
            });
        } catch (err) {
            console.error('[Clerk Sync Error]:', err);
            const isForbidden = err.message.includes('Impersonation') || err.message.includes('Access Denied') || err.message.includes('unverified');
            res.status(isForbidden ? 403 : 500).json({
                success: false,
                error: isForbidden ? 'FORBIDDEN' : 'CLERK_SYNC_FAILED',
                message: `Failed to synchronize Clerk session: ${err.message}`
            });
        }
    }
}

module.exports = new AuthController();
