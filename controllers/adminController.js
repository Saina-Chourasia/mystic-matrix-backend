const { getDb } = require('../config/db');
const orderModel = require('../models/orderModel');
const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const datasetModel = require('../models/datasetModel');

class AdminController {
    /**
     * Comprehensive Admin Overview Metrics
     */
    getDashboard(req, res) {
        try {
            const db = getDb();

            // 1. Inventory Summary
            const invStats = db.prepare(`
                SELECT 
                    COUNT(*) as total_products,
                    SUM(current_stock) as total_units_in_stock,
                    ROUND(SUM(current_stock * unit_cost), 2) as total_cost_value,
                    ROUND(SUM(current_stock * selling_price), 2) as total_retail_value,
                    SUM(CASE WHEN current_stock <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
                    SUM(CASE WHEN current_stock > 0 AND current_stock <= min_stock_level THEN 1 ELSE 0 END) as low_stock_count
                FROM products
                WHERE is_archived = 0
            `).get();

            // 2. Customer Portal Orders Summary
            const orderStats = db.prepare(`
                SELECT 
                    COUNT(*) as total_orders,
                    ROUND(SUM(total_amount), 2) as total_order_revenue,
                    ROUND(AVG(total_amount), 2) as average_order_value,
                    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_orders
                FROM orders
            `).get();

            // 3. Counter Sales Summary (Fictional Demo Sales)
            const salesStats = db.prepare(`
                SELECT 
                    COUNT(*) as total_transactions,
                    ROUND(SUM(total_amount), 2) as total_sales_revenue,
                    SUM(quantity) as total_units_sold
                FROM sales
                WHERE provenance = 'DEMO_POTION_SHOP'
            `).get();

            // 4. Users Summary
            const userStats = db.prepare(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END) as admin_count,
                    SUM(CASE WHEN role = 'USER' THEN 1 ELSE 0 END) as customer_count
                FROM users
            `).get();

            // 5. Datasets Metadata
            const datasetSources = datasetModel.getSources();
            const latestImport = db.prepare('SELECT * FROM dataset_imports ORDER BY started_at DESC LIMIT 1').get();

            // 6. Recent Orders (Top 5)
            const recentOrders = orderModel.getAll(5, 0);

            // 7. Critical Low Stock Alerts
            const lowStockItems = db.prepare(`
                SELECT id, name, sku, current_stock, min_stock_level, selling_price, image_url
                FROM products
                WHERE is_archived = 0 AND current_stock <= min_stock_level
                ORDER BY current_stock ASC
                LIMIT 6
            `).all();

            res.json({
                success: true,
                data: {
                    inventory: invStats,
                    orders: orderStats,
                    counterSales: salesStats,
                    users: userStats,
                    datasetSources,
                    latestImport,
                    recentOrders,
                    lowStockAlerts: lowStockItems
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * View All Customer Orders (Admin Access)
     */
    getOrders(req, res) {
        try {
            const { limit = 50, offset = 0, status, search } = req.query;
            const db = getDb();

            const conditions = [];
            const params = [];

            if (status) {
                conditions.push('o.status = ?');
                params.push(status);
            }
            if (search) {
                conditions.push('(o.order_number LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const total = db.prepare(`
                SELECT COUNT(*) as count 
                FROM orders o 
                JOIN users u ON u.id = o.user_id 
                ${whereClause}
            `).get(...params).count;

            const orders = db.prepare(`
                SELECT o.*, u.name as customer_name, u.email as customer_email,
                       (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
                FROM orders o
                JOIN users u ON u.id = o.user_id
                ${whereClause}
                ORDER BY o.created_at DESC
                LIMIT ? OFFSET ?
            `).all(...params, Number(limit), Number(offset));

            res.json({
                success: true,
                total,
                limit: Number(limit),
                offset: Number(offset),
                data: orders
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Get Detailed Order by ID (Admin Access)
     */
    getOrderById(req, res) {
        try {
            const { id } = req.params;
            const order = orderModel.getById(Number(id));
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            res.json({ success: true, data: order });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * View All Registered Users (Admin Access)
     */
    getUsers(req, res) {
        try {
            const { limit = 50, offset = 0 } = req.query;
            const users = userModel.getAll(Number(limit), Number(offset));
            const total = userModel.count();

            res.json({
                success: true,
                total,
                data: users
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Update User Role or Status (Admin Access)
     */
    updateUser(req, res) {
        try {
            const { id } = req.params;
            const { role, is_active } = req.body;
            const db = getDb();

            const targetUser = userModel.findById(Number(id));
            if (!targetUser) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            // Cannot modify own account role or deactivate self
            if (req.user.id === targetUser.id) {
                return res.status(400).json({
                    success: false,
                    message: 'Administrators cannot alter their own role or deactivate their active session.'
                });
            }

            if (role && ['ADMIN', 'USER'].includes(role)) {
                userModel.updateRole(targetUser.id, role);
            }

            if (is_active !== undefined) {
                db.prepare('UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(is_active ? 1 : 0, targetUser.id);
            }

            auditModel.log({
                userId: req.user.id,
                action: 'USER_ROLE_OR_STATUS_MODIFIED',
                entityType: 'USER',
                entityId: targetUser.id,
                details: { modifiedUserId: targetUser.id, newRole: role, isActive: is_active },
                ipAddress: req.ip
            });

            res.json({
                success: true,
                message: `Updated account permissions for ${targetUser.name}`,
                data: userModel.findById(targetUser.id)
            });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * View Security & Operation Audit Logs
     */
    getAuditLogs(req, res) {
        try {
            const { limit = 50, offset = 0 } = req.query;
            const logs = auditModel.getAll(Number(limit), Number(offset));
            const total = auditModel.count();

            res.json({
                success: true,
                total,
                data: logs
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Dataset Management & Catalog Status
     */
    getDatasets(req, res) {
        try {
            const sources = datasetModel.getSources();
            const imports = datasetModel.getImports(10, 0);

            res.json({
                success: true,
                data: {
                    sources,
                    imports
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Paginated Real Retail Transactions (UCI Online Retail II)
     */
    getRetailTransactions(req, res) {
        try {
            const { limit = 50, offset = 0, stockCode, isCancellation, splitType } = req.query;

            const isCanc = isCancellation !== undefined 
                ? (isCancellation === 'true' || isCancellation === '1') 
                : null;

            const result = datasetModel.getRetailTransactions({
                limit: Number(limit),
                offset: Number(offset),
                stockCode: stockCode || null,
                isCancellation: isCanc,
                splitType: splitType || null
            });

            res.json({
                success: true,
                ...result,
                attribution: "Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D"
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Aggregated Daily Demand Summary for Real Retail Dataset
     */
    getDailyDemand(req, res) {
        try {
            const { limit = 30, stockCode, splitType } = req.query;
            const result = datasetModel.getDailyDemandSummary({
                limit: Number(limit),
                stockCode: stockCode || null,
                splitType: splitType || null
            });

            const topProducts = datasetModel.getTopRetailProducts(10);

            res.json({
                success: true,
                data: {
                    ...result,
                    topProducts
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Trigger UCI Dataset Import Pipeline
     */
    async triggerImport(req, res) {
        try {
            const datasetImportService = require('../services/datasetImportService');
            const { force = false, sampleOnly = false } = req.body;

            const status = await datasetImportService.runImportPipeline({ force, sampleOnly });

            auditModel.log({
                userId: req.user.id,
                action: 'DATASET_IMPORT_TRIGGERED',
                entityType: 'DATASET',
                entityId: 'uci_online_retail_ii',
                details: { status },
                ipAddress: req.ip
            });

            res.json({
                success: true,
                message: status.message,
                data: status
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'IMPORT_FAILED',
                message: err.message
            });
        }
    }
}

module.exports = new AdminController();

