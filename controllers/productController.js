const ProductModel = require('../models/productModel');
const TransactionModel = require('../models/transactionModel');
const InventoryService = require('../services/inventoryService');
const ForecastingService = require('../services/forecastingService');

class ProductController {
    static getAll(req, res) {
        try {
            const { categoryId, search, status, type, includeArchived } = req.query;
            let products = ProductModel.getAll({ 
                categoryId, 
                search, 
                itemType: type,
                includeArchived: includeArchived === 'true' || includeArchived === '1'
            });

            // Enrich with current forecast & stock status
            const forecasts = ForecastingService.forecastAll();
            const forecastMap = new Map();
            for (const f of forecasts) {
                forecastMap.set(f.product_id, f);
            }

            products = products.map(prod => {
                const fc = forecastMap.get(prod.id);
                return {
                    ...prod,
                    stock_status: fc ? fc.predictions.stock_status : 'HEALTHY',
                    predicted_30d_demand: fc ? fc.predictions.predicted_30d_demand : 0,
                    days_until_stockout: fc ? fc.predictions.days_until_stockout : 999,
                    suggested_reorder: fc ? fc.predictions.suggested_reorder_qty : 0,
                    seasonal_factor: fc ? fc.metrics.seasonal_factor : 1.0
                };
            });

            if (status && status !== 'ALL') {
                products = products.filter(p => p.stock_status.toLowerCase() === status.toLowerCase());
            }

            res.json({ success: true, count: products.length, data: products });
        } catch (error) {
            console.error('Error fetching products:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static getById(req, res) {
        try {
            const { id } = req.params;
            const product = ProductModel.getById(id);
            if (!product) {
                return res.status(404).json({ success: false, message: 'Magical item not found.' });
            }
            const forecast = ForecastingService.forecastProduct(id);
            const transactions = TransactionModel.getAll({ productId: id, limit: 10 });
            res.json({ success: true, data: { ...product, forecast, recent_transactions: transactions } });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static create(req, res) {
        try {
            const { name, category_id, supplier_id, selling_price } = req.body;
            if (!name || !category_id || !supplier_id || !selling_price) {
                return res.status(400).json({ success: false, message: 'Missing required product parameters: name, category_id, supplier_id, selling_price.' });
            }

            const newProduct = ProductModel.create(req.body);

            // Log initial inventory transaction
            TransactionModel.create({
                product_id: newProduct.id,
                type: 'RESTOCK',
                quantity: newProduct.current_stock,
                previous_stock: 0,
                new_stock: newProduct.current_stock,
                reason: 'Initial apothecary product catalog introduction'
            });

            res.status(201).json({ success: true, message: 'Magical reagent cataloged successfully in Madam Hex grimoire.', data: newProduct });
        } catch (error) {
            console.error('Create product error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static update(req, res) {
        try {
            const { id } = req.params;
            const existing = ProductModel.getById(id);
            if (!existing) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }

            const updated = ProductModel.update(id, req.body);
            res.json({ success: true, message: 'Product updated successfully in grimoire.', data: updated });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static archive(req, res) {
        try {
            const { id } = req.params;
            const isArchived = req.body.is_archived !== undefined ? req.body.is_archived : true;
            const result = InventoryService.setArchiveStatus(id, isArchived);
            res.json({
                success: true,
                message: isArchived ? 'Product safely archived from active apothecary ledger.' : 'Product restored to active apothecary shelves.',
                data: result
            });
        } catch (error) {
            res.status(error.message.includes('not found') ? 404 : 500).json({ success: false, message: error.message });
        }
    }

    static delete(req, res) {
        try {
            const { id } = req.params;
            const existing = ProductModel.getById(id);
            if (!existing) {
                return res.status(404).json({ success: false, message: 'Product not found.' });
            }

            // Safe soft-delete / archival to protect relational foreign keys in sales & recipes
            ProductModel.delete(id);
            res.json({ success: true, message: 'Product archived safely from active shelves.' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static adjustStock(req, res) {
        try {
            const productId = req.params.id || req.body.product_id;
            const { adjustment, type, reason } = req.body;

            if (!productId) {
                return res.status(400).json({ success: false, message: 'Product ID is required.' });
            }

            const result = InventoryService.adjustStock({
                productId: parseInt(productId, 10),
                adjustment,
                type,
                reason,
                userId: req.adminUser?.email
            });

            res.json({
                success: true,
                message: `Stock updated for ${result.productName}: ${result.previousStock} -> ${result.newStock} (${result.delta > 0 ? '+' : ''}${result.delta} units)`,
                data: result
            });
        } catch (error) {
            const isClientError = error.message.includes('Insufficient stock') || error.message.includes('not found') || error.message.includes('must be a non-zero');
            res.status(isClientError ? 400 : 500).json({ success: false, message: error.message });
        }
    }

    static getValuation(req, res) {
        try {
            const valuation = InventoryService.getValuation();
            res.json({ success: true, data: valuation });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static getTransactions(req, res) {
        try {
            const { id } = req.params;
            const limit = parseInt(req.query.limit, 10) || 50;
            const transactions = TransactionModel.getAll({ productId: id, limit });
            res.json({ success: true, count: transactions.length, data: transactions });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = ProductController;
