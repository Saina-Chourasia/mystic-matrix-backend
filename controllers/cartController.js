const cartModel = require('../models/cartModel');

class CartController {
    /**
     * Get Current User Cart with Authoritative Recalculated Totals
     */
    getCart(req, res) {
        try {
            const userId = req.user.id;
            const cart = cartModel.getCartWithItems(userId);
            res.json({
                success: true,
                data: cart
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'CART_FETCH_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Add Item to Cart
     */
    addItem(req, res) {
        try {
            const userId = req.user.id;
            const { productId, quantity = 1 } = req.body;

            if (!productId || isNaN(productId)) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_INPUT',
                    message: 'Valid product ID is required.'
                });
            }

            const parsedQty = parseInt(quantity, 10);
            if (isNaN(parsedQty) || parsedQty <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_QUANTITY',
                    message: 'Quantity must be a positive integer.'
                });
            }

            const cart = cartModel.addItem(userId, Number(productId), parsedQty);

            res.json({
                success: true,
                message: 'Magical item placed into your satchel.',
                data: cart
            });
        } catch (err) {
            res.status(400).json({
                success: false,
                error: 'CART_ADD_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Update Cart Item Quantity
     */
    updateItem(req, res) {
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const { quantity } = req.body;

            const parsedQty = parseInt(quantity, 10);
            if (isNaN(parsedQty) || parsedQty < 0) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_QUANTITY',
                    message: 'Quantity must be a non-negative integer.'
                });
            }

            const cart = cartModel.updateItemQuantity(userId, Number(id), parsedQty);

            res.json({
                success: true,
                message: 'Satchel quantity updated.',
                data: cart
            });
        } catch (err) {
            res.status(400).json({
                success: false,
                error: 'CART_UPDATE_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Remove Item from Cart
     */
    removeItem(req, res) {
        try {
            const userId = req.user.id;
            const { id } = req.params;

            const cart = cartModel.removeItem(userId, Number(id));

            res.json({
                success: true,
                message: 'Item removed from your satchel.',
                data: cart
            });
        } catch (err) {
            res.status(400).json({
                success: false,
                error: 'CART_REMOVE_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Clear Entire Cart
     */
    clearCart(req, res) {
        try {
            const userId = req.user.id;
            cartModel.clearCart(userId);
            const cart = cartModel.getCartWithItems(userId);

            res.json({
                success: true,
                message: 'Satchel emptied.',
                data: cart
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'CART_CLEAR_FAILED',
                message: err.message
            });
        }
    }
}

module.exports = new CartController();

