const { getDb } = require('../config/db');

class SalesModel {
    static getAll({ productId, startDate, endDate, limit = 100 } = {}) {
        const db = getDb();
        let query = `
            SELECT 
                s.*,
                p.name as product_name,
                c.name as category_name
            FROM sales s
            JOIN products p ON s.product_id = p.id
            JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (productId) {
            query += ` AND s.product_id = ?`;
            params.push(productId);
        }
        if (startDate) {
            query += ` AND s.sale_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND s.sale_date <= ?`;
            params.push(endDate);
        }

        query += ` ORDER BY s.sale_date DESC, s.id DESC LIMIT ?`;
        params.push(limit);

        return db.prepare(query).all(...params);
    }

    static create(data) {
        const db = getDb();
        const totalAmount = data.total_amount || (data.quantity * data.unit_price);
        const saleDate = data.sale_date || new Date().toISOString().split('T')[0];

        const stmt = db.prepare(`
            INSERT INTO sales (product_id, quantity, unit_price, total_amount, sale_date, customer_type, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            data.product_id,
            data.quantity,
            data.unit_price,
            totalAmount,
            saleDate,
            data.customer_type || 'Witch',
            data.notes || 'Counter sale'
        );

        return db.prepare(`SELECT * FROM sales ORDER BY id DESC LIMIT 1`).get();
    }

    static getProductDailySales(productId, days = 90) {
        const db = getDb();
        const query = `
            SELECT 
                sale_date,
                SUM(quantity) as daily_quantity,
                SUM(total_amount) as daily_revenue
            FROM sales
            WHERE product_id = ?
            GROUP BY sale_date
            ORDER BY sale_date ASC
        `;
        return db.prepare(query).all(productId);
    }

    static getOverallDailySales(days = 30) {
        const db = getDb();
        const query = `
            SELECT 
                sale_date,
                SUM(quantity) as total_quantity,
                SUM(total_amount) as total_revenue,
                COUNT(id) as transaction_count
            FROM sales
            GROUP BY sale_date
            ORDER BY sale_date DESC
            LIMIT ?
        `;
        const rows = db.prepare(query).all(days);
        return rows.reverse(); // Chronological order
    }

    static getTopSellers(limit = 5) {
        const db = getDb();
        const query = `
            SELECT 
                p.id,
                p.name,
                p.image_url,
                c.name as category_name,
                SUM(s.quantity) as total_units_sold,
                ROUND(SUM(s.total_amount), 2) as total_revenue,
                ROUND(SUM(s.quantity * (p.selling_price - p.unit_cost)), 2) as estimated_profit
            FROM sales s
            JOIN products p ON s.product_id = p.id
            JOIN categories c ON p.category_id = c.id
            GROUP BY p.id
            ORDER BY total_units_sold DESC
            LIMIT ?
        `;
        return db.prepare(query).all(limit);
    }

    static getCategoryPerformance() {
        const db = getDb();
        const query = `
            SELECT 
                c.id,
                c.name,
                COUNT(DISTINCT p.id) as product_count,
                COALESCE(SUM(s.quantity), 0) as total_units_sold,
                ROUND(COALESCE(SUM(s.total_amount), 0), 2) as total_revenue
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            LEFT JOIN sales s ON p.id = s.product_id
            GROUP BY c.id
            ORDER BY total_revenue DESC
        `;
        return db.prepare(query).all();
    }
}

module.exports = SalesModel;

