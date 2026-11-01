const orderModel = require('../models/orderModel');
const cartModel = require('../models/cartModel');
const auditModel = require('../models/auditModel');
const AiMonitoringService = require('../services/aiMonitoringService');

class OrderController {
    /**
     * Checkout Cart & Create Authoritative Order
     */
    async createOrder(req, res) {
        try {
            const userId = req.user.id;
            const { shippingAddress, notes, paymentMethod = 'DEMO_SPELL_GOLD' } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;

            // 1. Fetch current cart
            const cart = cartModel.getCartWithItems(userId);
            if (!cart || !cart.items || cart.items.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'EMPTY_CART',
                    message: 'Your magical satchel is empty. Please select potions or ingredients before placing an order.'
                });
            }

            // 2. Validate that every item has sufficient stock
            for (const item of cart.items) {
                if (!item.in_stock) {
                    return res.status(400).json({
                        success: false,
                        error: 'INSUFFICIENT_STOCK',
                        message: `Not enough stock available for "${item.name}". Only ${item.available_stock} remaining.`
                    });
                }
            }

            // 3. Atomically execute order creation, stock deduction, and sales/inventory movement writes
            const order = orderModel.createOrderWithInventoryDeduction({
                userId,
                items: cart.items.map(i => ({
                    product_id: i.product_id,
                    quantity: i.quantity
                })),
                shippingAddress: shippingAddress || 'Hallowmere Nocturnal Quarter',
                notes: notes || null,
                paymentMethod
            });

            // 4. Empty user's cart on successful checkout
            cartModel.clearCart(userId);

            // 5. Audit log
            auditModel.log({
                userId,
                action: 'CUSTOMER_ORDER_PLACED',
                entityType: 'ORDER',
                entityId: order.id,
                details: {
                    orderNumber: order.order_number,
                    itemCount: order.items.length,
                    totalAmount: order.total_amount
                },
                ipAddress
            });

            // Asynchronously trigger AI inventory monitoring check
            AiMonitoringService.runEventTriggeredCheck('ORDER_CHECKOUT', { orderId: order.id });

            res.status(201).json({
                success: true,
                message: `Pact sealed! Order #${order.order_number} confirmed.`,
                data: order
            });
        } catch (err) {
            console.error('Order creation error:', err.message);
            res.status(400).json({
                success: false,
                error: 'ORDER_FAILED',
                message: err.message || 'Could not finalize order. Inventory has not been charged.'
            });
        }
    }

    /**
     * Get Current Customer's Own Order History
     */
    getMyOrders(req, res) {
        try {
            const userId = req.user.id;
            const { limit = 50, offset = 0 } = req.query;

            const orders = orderModel.getByUserId(userId, Number(limit), Number(offset));

            res.json({
                success: true,
                total: orders.length,
                data: orders
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'QUERY_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Get Order Details by ID (Strict Object-Level Ownership Enforced)
     */
    getOrderById(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const isAdmin = req.user.role === 'ADMIN';

            let order;
            if (isAdmin) {
                // Administrator can view any order
                order = orderModel.getById(Number(id));
            } else {
                // Customer can ONLY view their own order
                order = orderModel.getByIdAndUserId(Number(id), userId);
            }

            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'ORDER_NOT_FOUND',
                    message: 'Order not found or you are not authorized to view this transaction.'
                });
            }

            res.json({
                success: true,
                data: order
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'QUERY_FAILED',
                message: err.message
            });
        }
    }
}

module.exports = new OrderController();

