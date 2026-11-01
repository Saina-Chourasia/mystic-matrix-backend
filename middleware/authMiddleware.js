const authService = require('../services/authService');
const clerkService = require('../services/clerkService');
const userModel = require('../models/userModel');

/**
 * Extract session ID from cookie or Bearer header
 */
function extractSessionId(req) {
    if (req.cookies) {
        if (req.cookies[authService.sessionCookieName]) {
            return req.cookies[authService.sessionCookieName];
        }
        if (req.cookies[authService.legacySessionCookieName]) {
            return req.cookies[authService.legacySessionCookieName];
        }
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    return null;
}

/**
 * Resolve user from Clerk auth, Clerk Bearer JWT, or standard session cookie
 */
async function resolveUser(req) {
    if (req.user) return req.user;

    // 1. Check if @clerk/express already parsed req.auth
    if (req.auth && req.auth.userId) {
        const clerkDbUser = userModel.findByClerkId(req.auth.userId);
        if (clerkDbUser) {
            req.user = clerkDbUser;
            return clerkDbUser;
        }
    }

    // 2. Check Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        // If it's a Clerk JWT
        if (token.startsWith('eyJ') && clerkService.isConfigured()) {
            try {
                const verified = await clerkService.verifySessionToken(token);
                if (verified && verified.sub) {
                    const user = userModel.findByClerkId(verified.sub);
                    if (user) {
                        req.user = user;
                        return user;
                    }
                }
            } catch (err) {
                // Non-valid Clerk token, proceed to session check
            }
        }

        // Traditional session ID token
        const sessionUser = authService.verifySession(token);
        if (sessionUser) {
            req.user = sessionUser;
            req.sessionId = token;
            return sessionUser;
        }
    }

    // 3. Check traditional session cookie
    const sessionId = extractSessionId(req);
    if (sessionId) {
        const sessionUser = authService.verifySession(sessionId);
        if (sessionUser) {
            req.user = sessionUser;
            req.sessionId = sessionId;
            return sessionUser;
        }
    }

    return null;
}

/**
 * Optional Session Middleware: Attaches req.user if session is valid, but does not block
 */
async function optionalSession(req, res, next) {
    try {
        req.user = await resolveUser(req);
    } catch (e) {
        req.user = null;
    }
    next();
}

/**
 * Require Authenticated Session (Any verified role)
 */
async function requireAuth(req, res, next) {
    try {
        const user = await resolveUser(req);
        if (!user) {
            const sessionId = extractSessionId(req);
            if (sessionId) {
                res.clearCookie(authService.sessionCookieName, { path: '/' });
                res.clearCookie(authService.legacySessionCookieName, { path: '/' });
            }
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: "Authentication required. Please sign in to Madam Hex's grimoire."
            });
        }
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: 'AUTH_ERROR',
            message: 'Authentication verification failed.'
        });
    }
}

/**
 * Require Specific Role(s)
 */
function requireRole(allowedRoles) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return async (req, res, next) => {
        try {
            const user = await resolveUser(req);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'UNAUTHORIZED',
                    message: "Authentication required. Please sign in to Madam Hex's grimoire."
                });
            }

            if (!roles.includes(user.role)) {
                return res.status(403).json({
                    success: false,
                    error: 'FORBIDDEN',
                    message: `Access denied! This mystical sanctum requires ${roles.join(' or ')} privileges.`
                });
            }

            req.user = user;
            next();
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: 'AUTH_ERROR',
                message: 'Authentication verification failed.'
            });
        }
    };
}

/**
 * Require Administrator Privileges (Strictly ADMIN role)
 */
const requireAdmin = requireRole(['ADMIN']);

/**
 * Require Customer / User Privileges (USER or ADMIN)
 */
const requireUser = requireRole(['USER', 'ADMIN']);

/**
 * Backward compatibility alias for existing routes
 */
const requireAdminAuth = requireAdmin;

/**
 * CSRF & Origin Security Middleware for state-mutating requests
 */
function verifyCsrfToken(req, res, next) {
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutatingMethods.includes(req.method)) {
        return next();
    }

    // Origin / Host verification
    const host = req.headers.host;
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    if (origin) {
        try {
            const parsedOrigin = new URL(origin);
            const isNativeCapacitorOrigin = origin.startsWith('capacitor://') ||
                                            origin.startsWith('ionic://') ||
                                            (parsedOrigin.hostname === 'localhost' && (origin.startsWith('http://') || origin.startsWith('https://')));

            // Allow origins defined in FRONTEND_URL or ALLOWED_ORIGINS (e.g., https://mystic-matrix.vercel.app)
            const allowedOriginsEnv = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
                .split(',')
                .map(s => s.trim().replace(/\/+$/, ''))
                .filter(Boolean);

            const isConfiguredFrontendOrigin = allowedOriginsEnv.some(allowed => {
                try {
                    return new URL(allowed).host === parsedOrigin.host;
                } catch (e) {
                    return allowed === origin;
                }
            }) || (parsedOrigin.hostname.endsWith('.vercel.app'));

            if (!isNativeCapacitorOrigin && !isConfiguredFrontendOrigin && parsedOrigin.host !== host) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF_ORIGIN_MISMATCH',
                    message: 'Cross-site request blocked.'
                });
            }
        } catch (e) {
            return res.status(403).json({ success: false, error: 'INVALID_ORIGIN' });
        }
    }

    // If user is authenticated, verify CSRF header matches session token if provided
    const headerCsrf = req.headers['x-csrf-token'];
    if (req.user && req.user.csrf_token && headerCsrf) {
        if (headerCsrf !== req.user.csrf_token) {
            return res.status(403).json({
                success: false,
                error: 'CSRF_TOKEN_INVALID',
                message: 'Security token mismatch.'
            });
        }
    }

    next();
}

module.exports = {
    optionalSession,
    requireAuth,
    requireRole,
    requireAdmin,
    requireUser,
    requireAdminAuth,
    verifyCsrfToken
};
