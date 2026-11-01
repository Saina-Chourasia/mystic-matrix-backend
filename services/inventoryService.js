const { getDb } = require('../config/db');

/**
 * InventoryService — MYSTIC MATRIX
 * Handles atomic inventory operations, negative-stock prevention,
 * valuation calculations, and transaction auditing in SQLite.
 */
class InventoryService {
    /**
     * Atomically adjust stock for a product
     */
    static adjustStock({ productId, adjustment, type, reason, userId }) {
        const db = getDb();
        const delta = parseInt(adjustment, 10);

        if (isNaN(delta) || delta === 0) {
            throw new Error('Adjustment quantity must be a non-zero integer.');
        }

        db.exec('BEGIN IMMEDIATE;');
        try {
            const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
            if (!product) {
                throw new Error(`Product with ID ${productId} not found.`);
            }

            const currentStock = product.current_stock;
            const newStock = currentStock + delta;

            // Enforce Negative Stock Prevention (Section 1 Requirement)
            if (newStock < 0) {
                throw new Error(`Insufficient stock for "${product.name}": requested deduction of ${Math.abs(delta)} units exceeds available stock of ${currentStock} units.`);
            }

            // Update product stock
            db.prepare('UPDATE products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(newStock, productId);

            // Log inventory transaction atomically
            const txType = type || (delta > 0 ? 'RESTOCK' : 'ADJUSTMENT');
            const txReason = reason || (delta > 0 ? 'Stock replenishment' : 'Manual stock deduction');
            
            db.prepare(`
                INSERT INTO inventory_transactions (product_id, type, quantity, previous_stock, new_stock, reason)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(productId, txType, delta, currentStock, newStock, txReason);

            db.exec('COMMIT;');

            return {
                productId,
                productName: product.name,
                previousStock: currentStock,
                newStock,
                delta,
                type: txType,
                reason: txReason
            };
        } catch (error) {
            db.exec('ROLLBACK;');
            throw error;
        }
    }

    /**
     * Safe product archival (soft delete toggle)
     */
    static setArchiveStatus(productId, isArchived) {
        const db = getDb();
        const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId);
        if (!product) {
            throw new Error(`Product with ID ${productId} not found.`);
        }

        db.prepare('UPDATE products SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(isArchived ? 1 : 0, productId);

        return {
            productId,
            name: product.name,
            isArchived: Boolean(isArchived)
        };
    }

    /**
     * Get comprehensive inventory valuation & health metrics
     */
    static getValuation() {
        const db = getDb();
        const products = db.prepare(`
            SELECT 
                p.*,
                c.name as category_name
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.is_archived = 0
        `).all();

        let totalUnits = 0;
        let totalCostValuation = 0.0;
        let totalRetailValuation = 0.0;
        let overstockedValue = 0.0;
        let criticalExposureValue = 0.0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let overstockedCount = 0;
        let healthyCount = 0;

        for (const p of products) {
            const stock = p.current_stock;
            const cost = p.unit_cost || 0;
            const price = p.selling_price || 0;

            totalUnits += stock;
            totalCostValuation += stock * cost;
            totalRetailValuation += stock * price;

            if (stock <= 0) {
                outOfStockCount++;
                criticalExposureValue += (p.min_stock_level || 10) * price;
            } else if (stock <= p.min_stock_level) {
                lowStockCount++;
                criticalExposureValue += ((p.min_stock_level || 10) - stock) * price;
            } else if (stock > (p.max_stock_level || 100)) {
                overstockedCount++;
                overstockedValue += (stock - (p.max_stock_level || 100)) * cost;
            } else {
                healthyCount++;
            }
        }

        const potentialGrossProfit = totalRetailValuation - totalCostValuation;
        const profitMarginPct = totalRetailValuation > 0
            ? Number(((potentialGrossProfit / totalRetailValuation) * 100).toFixed(1))
            : 0;

        return {
            totalProducts: products.length,
            totalUnitsOnHand: totalUnits,
            totalCostValuation: Math.round(totalCostValuation * 100) / 100,
            totalRetailValuation: Math.round(totalRetailValuation * 100) / 100,
            potentialGrossProfit: Math.round(potentialGrossProfit * 100) / 100,
            profitMarginPct,
            overstockedTiedUpCost: Math.round(overstockedValue * 100) / 100,
            stockoutRevenueExposure: Math.round(criticalExposureValue * 100) / 100,
            counts: {
                healthy: healthyCount,
                lowStock: lowStockCount,
                outOfStock: outOfStockCount,
                overstocked: overstockedCount
            }
        };
    }
}

module.exports = InventoryService;

