const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const fs = require('node:fs');

// Load environment variables from root or backend
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });

const { getDb } = require('./config/db');
const { errorHandler } = require('./middleware/errorHandler');
const { requireAdminAuth } = require('./middleware/authMiddleware');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const profileRoutes = require('./routes/profileRoutes');
const adminRoutes = require('./routes/adminRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const salesRoutes = require('./routes/salesRoutes');
const forecastRoutes = require('./routes/forecastRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const recipeRoutes = require('./routes/recipeRoutes');
const productionRoutes = require('./routes/productionRoutes');
const aiRoutes = require('./routes/aiRoutes');
const AiMonitoringService = require('./services/aiMonitoringService');

const app = express();
const PORT = process.env.PORT || 5001;

// Initialize Database connection on boot
getDb();

// Middlewares
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk Express Authentication Middleware (Conditional if configured)
const clerkService = require('./services/clerkService');
if (clerkService.isConfigured()) {
    try {
        const { clerkMiddleware } = require('@clerk/express');
        app.use(clerkMiddleware({
            secretKey: clerkService.getSecretKey(),
            publishableKey: clerkService.getPublishableKey()
        }));
        console.log('🛡️  [Auth] Clerk Express SDK initialized and active');
    } catch (clerkInitErr) {
        console.warn('⚠️  [Auth] Clerk Express SDK initialization failed:', clerkInitErr.message);
    }
} else {
    console.log('ℹ️  [Auth] Clerk credentials not set. Native session & password auth active. Configure CLERK_SECRET_KEY to enable Clerk.');
}

// Path to frontend production build & static images
const frontendDist = path.resolve(__dirname, '../frontend/dist');
const localImages = path.resolve(__dirname, 'public/images');
const monorepoImages = path.resolve(__dirname, '../frontend/public/images');
const frontendPublicImages = fs.existsSync(localImages) ? localImages : monorepoImages;

// Serve static images & public assets
app.use('/images', express.static(frontendPublicImages));
if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
}

// -------------------------------------------------------------------
// Public REST API Routes
// -------------------------------------------------------------------
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        app: 'Mystic Matrix Unified Platform',
        shop: "Madam Hex's 8-Bit Apothecary & Ingredient Emporium",
        realm: 'Hallowmere Nocturnal Market',
        database: 'SQLite (database/hexventory.db)',
        adminConfigured: Boolean(process.env.ADMIN_EMAIL),
        timestamp: new Date().toISOString()
    });
});

// Authentication Routes (Public Login / OAuth / Session)
app.use('/api/auth', authRoutes);

// Customer Shop Catalog Routes (Public & Customer)
app.use('/api/shop', shopRoutes);

// Customer Portal Protected Routes (Cart, Orders, Profile)
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/profile', profileRoutes);

// -------------------------------------------------------------------
// Protected Admin REST API Routes (Requires Verified Admin Session)
// -------------------------------------------------------------------
app.use('/api/admin', adminRoutes);
app.use('/api/products', requireAdminAuth, productRoutes);
app.use('/api/categories', requireAdminAuth, categoryRoutes);
app.use('/api/suppliers', requireAdminAuth, supplierRoutes);
app.use('/api/sales', requireAdminAuth, salesRoutes);
app.use('/api/forecasts', requireAdminAuth, forecastRoutes);
app.use('/api/recommendations', requireAdminAuth, recommendationRoutes);
app.use('/api/analytics', requireAdminAuth, analyticsRoutes);
app.use('/api/inventory', requireAdminAuth, inventoryRoutes);
app.use('/api/recipes', requireAdminAuth, recipeRoutes);
app.use('/api/production', requireAdminAuth, productionRoutes);
app.use('/api/ai', requireAdminAuth, aiRoutes);

// -------------------------------------------------------------------
// Single Hosting / Unified SPA Route
// Serves the React frontend index.html for all non-API GET requests
// -------------------------------------------------------------------
app.get('*', (req, res, next) => {
    // If it's an unhandled API endpoint, return 404 JSON
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({
            success: false,
            message: `Apothecary API endpoint not found: ${req.originalUrl}`
        });
    }

    const indexHtml = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexHtml)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(indexHtml);
    } else {
        res.send(`
            <html>
                <body style="background:#0B0416;color:#F4EBD9;font-family:sans-serif;padding:40px;text-align:center;">
                    <h1 style="color:#A855F7;">MYSTIC MATRIX API is Online</h1>
                    <p>Frontend production build is generating. Please run: <code>npm run build</code></p>
                    <p><a href="/api/health" style="color:#F5BA42;">Check /api/health</a></p>
                </body>
            </html>
        `);
    }
});

// Error handling middleware
app.use(errorHandler);

let server = null;
if (require.main === module) {
    server = app.listen(PORT, () => {
        console.log(`
    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                                                                       ║
    ║   🔮 MYSTIC MATRIX Unified Single-Host Platform Online                ║
    ║   🌐 Public URL: http://localhost:${PORT}                                ║
    ║   📜 Tagline: "The Enchanted Inventory for Every Potion and Prophecy." ║
    ║   🧪 Database: SQLite (database/hexventory.db)                        ║
    ║   ✨ Unified Frontend & Backend on Port ${PORT}                          ║
    ║   🤖 Mystic AI — The Inventory Oracle: Active                         ║
    ║                                                                       ║
    ╚═══════════════════════════════════════════════════════════════════════╝
        `);

        // Initialize AI Agent background audit scan
        setTimeout(() => {
            try {
                console.log('🔮 [Mystic AI] Booting Inventory Oracle background audit...');
                const scanRes = AiMonitoringService.runFullInventoryScan('SCHEDULED');
                console.log(`✨ [Mystic AI] Initial audit complete: ${scanRes.totalFindings} findings in ${scanRes.executionMs}ms.`);
            } catch (scanErr) {
                console.error('❌ [Mystic AI] Boot scan error:', scanErr.message);
            }
        }, 1500);

        // Schedule periodic audit scan every 15 minutes
        setInterval(() => {
            try {
                AiMonitoringService.runFullInventoryScan('SCHEDULED');
            } catch (err) {
                console.error('❌ [Mystic AI] Periodic scan error:', err.message);
            }
        }, 15 * 60 * 1000);
    });
}

module.exports = app;
