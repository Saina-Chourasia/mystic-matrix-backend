const { getDb } = require('../config/db');

class OrderModel {
    /**
     * Atomically creates an order from verified items, deducts inventory,
     * logs sales ledger entries with CUSTOMER_ORDER provenance, and writes audit transactions.
     */
    createOrderWithInventoryDeduction({ userId, items, shippingAddress = null, notes = null, paymentMethod = 'DEMO_SPELL_GOLD' }) {
        const db = getDb();

        if (!items || items.length === 0) {
            throw new Error('Cannot checkout an empty shopping cart');
        }

        // Generate human-readable unique order number: MM-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const orderNumber = `MM-${dateStr}-${randomSuffix}`;

        // BEGIN SQLite Transaction
        db.exec('BEGIN TRANSACTION;');

        try {
            // Step 1: Lock and validate all products & calculate authoritative server totals
            let subtotal = 0;
            const verifiedItems = [];

            const productStmt = db.prepare('SELECT id, name, sku, current_stock, selling_price, is_archived FROM products WHERE id = ?');
            const deductStockStmt = db.prepare(`
                UPDATE products 
                SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND current_stock >= ?
            `);
            const insertSaleStmt = db.prepare(`
                INSERT INTO sales (product_id, quantity, unit_price, total_amount, sale_date, customer_type, notes, provenance, order_id)
                VALUES (?, ?, ?, ?, date('now'), 'Online Customer', ?, 'CUSTOMER_ORDER', ?)
            `);
            const insertTransStmt = db.prepare(`
                INSERT INTO inventory_transactions (product_id, type, quantity, previous_stock, new_stock, reason, provenance, order_id)
                VALUES (?, 'SALE', ?, ?, ?, ?, 'CUSTOMER_ORDER', ?)
            `);

            for (const item of items) {
                const prod = productStmt.get(item.product_id);
                if (!prod) {
                    throw new Error(`Product with ID ${item.product_id} no longer exists.`);
                }
                if (prod.is_archived) {
                    throw new Error(`Product "${prod.name}" has been archived and cannot be ordered.`);
                }
                if (prod.current_stock < item.quantity) {
                    throw new Error(`Insufficient stock for "${prod.name}". Available: ${prod.current_stock}, requested: ${item.quantity}.`);
                }

                const unitPrice = prod.selling_price;
                const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
                subtotal += lineTotal;

                verifiedItems.push({
                    product_id: prod.id,
                    product_name: prod.name,
                    product_sku: prod.sku,
                    quantity: item.quantity,
                    unit_price: unitPrice,
                    total_price: lineTotal,
                    previous_stock: prod.current_stock,
                    new_stock: prod.current_stock - item.quantity
                });
            }

            subtotal = Number(subtotal.toFixed(2));
            const taxAmount = Number((subtotal * 0.05).toFixed(2));
            const shippingAmount = 0.0;
            const totalAmount = Number((subtotal + taxAmount + shippingAmount).toFixed(2));

            // Step 2: Create Master Order Record
            const insertOrderStmt = db.prepare(`
                INSERT INTO orders (order_number, user_id, status, subtotal, tax_amount, shipping_amount, total_amount, shipping_address, notes, payment_method)
                VALUES (?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?)
            `);
            const orderRes = insertOrderStmt.run(
                orderNumber,
                userId,
                subtotal,
                taxAmount,
                shippingAmount,
                totalAmount,
                shippingAddress,
                notes,
                paymentMethod
            );
            const orderId = orderRes.lastInsertRowid;

            // Step 3: Insert Order Items & Deduct Stock Atomically
            const insertOrderItemStmt = db.prepare(`
                INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, product_name, product_sku)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            for (const vItem of verifiedItems) {
                insertOrderItemStmt.run(
                    orderId,
                    vItem.product_id,
                    vItem.quantity,
                    vItem.unit_price,
                    vItem.total_price,
                    vItem.product_name,
                    vItem.product_sku
                );

                // Atomic stock deduction check
                const deductRes = deductStockStmt.run(vItem.quantity, vItem.product_id, vItem.quantity);
                if (deductRes.changes === 0) {
                    throw new Error(`Stock deduction failed for "${vItem.product_name}". Stock may have changed.`);
                }

                // Write to sales ledger with CUSTOMER_ORDER provenance
                insertSaleStmt.run(
                    vItem.product_id,
                    vItem.quantity,
                    vItem.unit_price,
                    vItem.total_price,
                    `Order ${orderNumber}`,
                    orderId
                );

                // Write to inventory transactions audit ledger
                insertTransStmt.run(
                    vItem.product_id,
                    vItem.quantity,
                    vItem.previous_stock,
                    vItem.new_stock,
                    `Customer Order #${orderNumber}`,
                    orderId
                );
            }

            // COMMIT SQLite Transaction
            db.exec('COMMIT;');

            return this.getById(orderId);
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }
    }

    getById(orderId) {
        const db = getDb();
        const order = db.prepare(`
            SELECT o.*, u.name as customer_name, u.email as customer_email
            FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE o.id = ?
        `).get(orderId);

        if (!order) return null;

        const items = db.prepare(`
            SELECT oi.*, p.image_url, p.description
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ?
            ORDER BY oi.id ASC
        `).all(orderId);

        return {
            ...order,
            items
        };
    }

    getByIdAndUserId(orderId, userId) {
        const db = getDb();
        const order = db.prepare(`
            SELECT o.*, u.name as customer_name, u.email as customer_email
            FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE o.id = ? AND o.user_id = ?
        `).get(orderId, userId);

        if (!order) return null;

        const items = db.prepare(`
            SELECT oi.*, p.image_url, p.description
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ?
            ORDER BY oi.id ASC
        `).all(orderId);

        return {
            ...order,
            items
        };
    }

    getByUserId(userId, limit = 50, offset = 0) {
        const db = getDb();
        const orders = db.prepare(`
            SELECT id, order_number, user_id, status, subtotal, tax_amount, shipping_amount, total_amount, payment_method, created_at
            FROM orders
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(userId, limit, offset);

        const itemsStmt = db.prepare(`
            SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price, oi.total_price, oi.product_name, oi.product_sku,
                   p.image_url
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ?
        `);

        return orders.map(o => ({
            ...o,
            items: itemsStmt.all(o.id)
        }));
    }

    getAll(limit = 100, offset = 0) {
        const db = getDb();
        const orders = db.prepare(`
            SELECT o.*, u.name as customer_name, u.email as customer_email,
                   (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
            FROM orders o
            JOIN users u ON u.id = o.user_id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        const itemsStmt = db.prepare(`
            SELECT oi.*, p.image_url
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ?
        `);

        return orders.map(o => ({
            ...o,
            items: itemsStmt.all(o.id)
        }));
    }

    count() {
        const db = getDb();
        return db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    }
}

module.exports = new OrderModel();

