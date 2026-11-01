const { getDb } = require('../config/db');

class ProductModel {
    static getAll({ categoryId, search, itemType, includeArchived = false } = {}) {
        const db = getDb();
        let query = `
            SELECT 
                p.*,
                c.name as category_name,
                c.slug as category_slug,
                s.name as supplier_name,
                s.lead_time_days,
                s.reliability_score
            FROM products p
            JOIN categories c ON p.category_id = c.id
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (!includeArchived) {
            query += ` AND p.is_archived = 0`;
        }

        if (categoryId) {
            query += ` AND p.category_id = ?`;
            params.push(categoryId);
        }

        if (itemType) {
            query += ` AND p.item_type = ?`;
            params.push(itemType);
        }

        if (search && search.trim() !== '') {
            query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)`;
            params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
        }

        query += ` ORDER BY p.id ASC`;
        return db.prepare(query).all(...params);
    }

    static getById(id) {
        const db = getDb();
        const query = `
            SELECT 
                p.*,
                c.name as category_name,
                c.slug as category_slug,
                s.name as supplier_name,
                s.lead_time_days,
                s.reliability_score
            FROM products p
            JOIN categories c ON p.category_id = c.id
            JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.id = ?
        `;
        return db.prepare(query).get(id);
    }

    static create(data) {
        const db = getDb();
        
        // Generate SKU if not provided
        let sku = data.sku;
        if (!sku) {
            const count = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(data.category_id).count + 1;
            const prefix = data.category_id === 2 ? 'HEX-POT' : 'HEX-ING';
            sku = `${prefix}-${String(count).padStart(3, '0')}`;
        }

        const isPotion = data.category_id === 2 || (data.name && data.name.toLowerCase().includes('potion'));
        const itemType = data.item_type || (isPotion ? 'potion' : 'ingredient');

        const stmt = db.prepare(`
            INSERT INTO products (
                sku, item_type, name, category_id, supplier_id, description, image_url,
                current_stock, min_stock_level, max_stock_level, unit_cost, selling_price,
                reorder_point, safety_stock, is_halloween_surge, is_archived
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `);

        stmt.run(
            sku,
            itemType,
            data.name,
            data.category_id,
            data.supplier_id,
            data.description || '',
            data.image_url || '/images/default-potion.svg',
            data.current_stock || 0,
            data.min_stock_level || 10,
            data.max_stock_level || 100,
            data.unit_cost || 5.0,
            data.selling_price || 12.0,
            data.reorder_point || 15,
            data.safety_stock || 8,
            data.is_halloween_surge ? 1 : 0
        );

        return db.prepare(`SELECT * FROM products WHERE sku = ?`).get(sku);
    }

    static update(id, data) {
        const db = getDb();
        const stmt = db.prepare(`
            UPDATE products SET
                name = COALESCE(?, name),
                sku = COALESCE(?, sku),
                item_type = COALESCE(?, item_type),
                category_id = COALESCE(?, category_id),
                supplier_id = COALESCE(?, supplier_id),
                description = COALESCE(?, description),
                image_url = COALESCE(?, image_url),
                current_stock = COALESCE(?, current_stock),
                min_stock_level = COALESCE(?, min_stock_level),
                max_stock_level = COALESCE(?, max_stock_level),
                unit_cost = COALESCE(?, unit_cost),
                selling_price = COALESCE(?, selling_price),
                reorder_point = COALESCE(?, reorder_point),
                safety_stock = COALESCE(?, safety_stock),
                is_halloween_surge = COALESCE(?, is_halloween_surge),
                is_archived = COALESCE(?, is_archived),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        stmt.run(
            data.name !== undefined ? data.name : null,
            data.sku !== undefined ? data.sku : null,
            data.item_type !== undefined ? data.item_type : null,
            data.category_id !== undefined ? data.category_id : null,
            data.supplier_id !== undefined ? data.supplier_id : null,
            data.description !== undefined ? data.description : null,
            data.image_url !== undefined ? data.image_url : null,
            data.current_stock !== undefined ? data.current_stock : null,
            data.min_stock_level !== undefined ? data.min_stock_level : null,
            data.max_stock_level !== undefined ? data.max_stock_level : null,
            data.unit_cost !== undefined ? data.unit_cost : null,
            data.selling_price !== undefined ? data.selling_price : null,
            data.reorder_point !== undefined ? data.reorder_point : null,
            data.safety_stock !== undefined ? data.safety_stock : null,
            data.is_halloween_surge !== undefined ? (data.is_halloween_surge ? 1 : 0) : null,
            data.is_archived !== undefined ? (data.is_archived ? 1 : 0) : null,
            id
        );

        return this.getById(id);
    }

    static updateStock(id, newStock) {
        const db = getDb();
        db.prepare(`UPDATE products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newStock, id);
        return this.getById(id);
    }

    static archive(id, isArchived = 1) {
        const db = getDb();
        db.prepare(`UPDATE products SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(isArchived ? 1 : 0, id);
        return this.getById(id);
    }

    static delete(id) {
        // Safe soft-delete / archival
        return this.archive(id, 1);
    }
}

module.exports = ProductModel;
