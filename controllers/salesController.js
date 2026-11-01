const SalesModel = require('../models/salesModel');
const ProductModel = require('../models/productModel');
const TransactionModel = require('../models/transactionModel');
const AiMonitoringService = require('../services/aiMonitoringService');

class SalesController {
    static getAll(req, res) {
        try {
            const { productId, startDate, endDate, limit } = req.query;
            const sales = SalesModel.getAll({
                productId: productId ? parseInt(productId, 10) : undefined,
                startDate,
                endDate,
                limit: limit ? parseInt(limit, 10) : 100
            });
            res.json({ success: true, count: sales.length, data: sales });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static create(req, res) {
        try {
            const { product_id, quantity, customer_type, notes } = req.body;
            if (!product_id || !quantity || quantity <= 0) {
                return res.status(400).json({ success: false, message: 'Valid product and quantity required.' });
            }

            const product = ProductModel.getById(product_id);
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }

            if (product.current_stock < quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock! Only ${product.current_stock} units available.`
                });
            }

            // Record sale
            const sale = SalesModel.create({
                product_id,
                quantity: parseInt(quantity, 10),
                unit_price: product.selling_price,
                total_amount: Math.round(quantity * product.selling_price * 100) / 100,
                customer_type: customer_type || 'Witch',
                notes: notes || 'Counter customer order'
            });

            // Decrement inventory
            const newStock = product.current_stock - quantity;
            ProductModel.updateStock(product_id, newStock);

            // Audit transaction
            TransactionModel.create({
                product_id,
                type: 'SALE',
                quantity: -quantity,
                previous_stock: product.current_stock,
                new_stock: newStock,
                reason: `Sale to ${customer_type || 'Customer'} (Ref #${sale.id})`
            });

            // Asynchronously trigger AI inventory check
            AiMonitoringService.runEventTriggeredCheck('COUNTER_SALE', { productId: product_id, quantity });

            res.status(201).json({
                success: true,
                message: `Recorded sale of ${quantity}x ${product.name}`,
                data: {
                    sale,
                    product_name: product.name,
                    total_price: sale.total_amount,
                    updated_stock: newStock
                }
            });
        } catch (error) {
            console.error('Record sale error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static getTransactions(req, res) {
        try {
            const { productId, limit } = req.query;
            const txs = TransactionModel.getAll({
                productId: productId ? parseInt(productId, 10) : undefined,
                limit: limit ? parseInt(limit, 10) : 50
            });
            res.json({ success: true, count: txs.length, data: txs });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = SalesController;

