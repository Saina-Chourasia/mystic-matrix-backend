const { getDb } = require('../config/db');

class TransactionModel {
    static getAll({ productId, limit = 50 } = {}) {
        const db = getDb();
        let query = `
            SELECT 
                t.*,
                p.name as product_name
            FROM inventory_transactions t
            JOIN products p ON t.product_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (productId) {
            query += ` AND t.product_id = ?`;
            params.push(productId);
        }

        query += ` ORDER BY t.created_at DESC, t.id DESC LIMIT ?`;
        params.push(limit);

        return db.prepare(query).all(...params);
    }

    static create({ product_id, type, quantity, previous_stock, new_stock, reason }) {
        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO inventory_transactions (product_id, type, quantity, previous_stock, new_stock, reason)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(product_id, type, quantity, previous_stock, new_stock, reason || 'Inventory update');
        return db.prepare(`SELECT * FROM inventory_transactions ORDER BY id DESC LIMIT 1`).get();
    }
}

module.exports = TransactionModel;

