const { getDb } = require('../config/db');

class CartModel {
    getOrCreateCart(userId) {
        const db = getDb();
        let cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(userId);
        if (!cart) {
            const res = db.prepare('INSERT INTO carts (user_id) VALUES (?)').run(userId);
            cart = { id: res.lastInsertRowid, user_id: userId, created_at: new Date().toISOString() };
        }
        return cart;
    }

    getCartWithItems(userId) {
        const db = getDb();
        const cart = this.getOrCreateCart(userId);

        const items = db.prepare(`
            SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity, ci.created_at, ci.updated_at,
                   p.name, p.sku, p.selling_price, p.current_stock, p.image_url, p.description,
                   c.name as category_name
            FROM cart_items ci
            JOIN products p ON p.id = ci.product_id
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE ci.cart_id = ?
            ORDER BY ci.id ASC
        `).all(cart.id);

        let subtotal = 0;
        let totalItems = 0;
        const formattedItems = items.map(item => {
            const itemTotal = Number((item.quantity * item.selling_price).toFixed(2));
            subtotal += itemTotal;
            totalItems += item.quantity;
            return {
                ...item,
                item_total: itemTotal,
                in_stock: item.current_stock >= item.quantity,
                available_stock: item.current_stock
            };
        });

        subtotal = Number(subtotal.toFixed(2));
        const tax = Number((subtotal * 0.05).toFixed(2)); // 5% Magical Reagents Tax
        const total = Number((subtotal + tax).toFixed(2));

        return {
            cart_id: cart.id,
            user_id: userId,
            items: formattedItems,
            total_items: totalItems,
            subtotal,
            tax,
            shipping: 0.0,
            total
        };
    }

    addItem(userId, productId, quantity = 1) {
        const db = getDb();
        const cart = this.getOrCreateCart(userId);

        // Check product existence and current stock
        const product = db.prepare('SELECT id, name, current_stock, selling_price FROM products WHERE id = ?').get(productId);
        if (!product) {
            throw new Error('Magical potion or ingredient not found');
        }

        const existingItem = db.prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?').get(cart.id, productId);

        if (existingItem) {
            const newQty = existingItem.quantity + quantity;
            if (newQty > product.current_stock) {
                throw new Error(`Insufficient stock for ${product.name}. Only ${product.current_stock} available.`);
            }
            db.prepare('UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, existingItem.id);
        } else {
            if (quantity > product.current_stock) {
                throw new Error(`Insufficient stock for ${product.name}. Only ${product.current_stock} available.`);
            }
            db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)').run(cart.id, productId, quantity);
        }

        return this.getCartWithItems(userId);
    }

    updateItemQuantity(userId, cartItemId, quantity) {
        const db = getDb();
        const cart = this.getOrCreateCart(userId);

        const item = db.prepare(`
            SELECT ci.id, ci.product_id, ci.cart_id, p.name, p.current_stock
            FROM cart_items ci
            JOIN products p ON p.id = ci.product_id
            WHERE ci.id = ? AND ci.cart_id = ?
        `).get(cartItemId, cart.id);

        if (!item) {
            throw new Error('Cart item not found');
        }

        if (quantity <= 0) {
            db.prepare('DELETE FROM cart_items WHERE id = ?').run(cartItemId);
        } else {
            if (quantity > item.current_stock) {
                throw new Error(`Cannot reserve ${quantity} units of ${item.name}. Only ${item.current_stock} in stock.`);
            }
            db.prepare('UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(quantity, cartItemId);
        }

        return this.getCartWithItems(userId);
    }

    removeItem(userId, cartItemId) {
        const db = getDb();
        const cart = this.getOrCreateCart(userId);
        db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(cartItemId, cart.id);
        return this.getCartWithItems(userId);
    }

    clearCart(userId) {
        const db = getDb();
        const cart = this.getOrCreateCart(userId);
        db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
    }
}

module.exports = new CartModel();

