const SupplierModel = require('../models/supplierModel');
const { getDb } = require('../config/db');
const AiMonitoringService = require('../services/aiMonitoringService');

class SupplierController {
    static getAll(req, res) {
        try {
            const suppliers = SupplierModel.getAll();
            res.json({ success: true, data: suppliers });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static getPurchaseOrders(req, res) {
        try {
            const db = getDb();
            const pos = db.prepare(`
                SELECT po.*, s.name as supplier_name, s.realm, s.lead_time_days
                FROM purchase_orders po
                JOIN suppliers s ON s.id = po.supplier_id
                ORDER BY po.created_at DESC
            `).all();

            const itemsStmt = db.prepare(`
                SELECT poi.*, p.name as product_name, p.sku
                FROM purchase_order_items poi
                JOIN products p ON p.id = poi.product_id
                WHERE poi.purchase_order_id = ?
            `);

            const fullPOs = pos.map(p => ({
                ...p,
                items: itemsStmt.all(p.id)
            }));

            res.json({ success: true, data: fullPOs });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static receivePurchaseOrder(req, res) {
        try {
            const { id } = req.params;
            const db = getDb();

            const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
            if (!po) {
                return res.status(404).json({ success: false, message: 'Purchase order not found' });
            }

            if (po.status === 'RECEIVED') {
                return res.status(400).json({ success: false, message: 'Purchase order has already been received.' });
            }

            const items = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(id);

            db.exec('BEGIN TRANSACTION;');
            try {
                // Update purchase order status
                db.prepare(`
                    UPDATE purchase_orders 
                    SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(id);

                // Update stock for each product & log transaction
                const updateStockStmt = db.prepare(`
                    UPDATE products 
                    SET current_stock = current_stock + ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `);
                const getStockStmt = db.prepare('SELECT current_stock FROM products WHERE id = ?');
                const logTransStmt = db.prepare(`
                    INSERT INTO inventory_transactions (product_id, type, quantity, previous_stock, new_stock, reason, provenance)
                    VALUES (?, 'RESTOCK', ?, ?, ?, ?, 'DEMO_POTION_SHOP')
                `);

                for (const item of items) {
                    const current = getStockStmt.get(item.product_id);
                    const prevStock = current ? current.current_stock : 0;
                    const newStock = prevStock + item.quantity_ordered;

                    updateStockStmt.run(item.quantity_ordered, item.product_id);

                    db.prepare('UPDATE purchase_order_items SET quantity_received = ? WHERE id = ?')
                        .run(item.quantity_ordered, item.id);

                    logTransStmt.run(
                        item.product_id,
                        item.quantity_ordered,
                        prevStock,
                        newStock,
                        `PO Receipt #${po.po_number}`
                    );
                }

                // Insert receipt
                db.prepare(`
                    INSERT INTO purchase_receipts (receipt_number, purchase_order_id, notes)
                    VALUES (?, ?, ?)
                `).run(`REC-${po.po_number}`, id, 'Goods verified and shelved in Hallowmere apothecary');

                db.exec('COMMIT;');
            } catch (txErr) {
                db.exec('ROLLBACK;');
                throw txErr;
            }

            // Asynchronously trigger AI inventory monitoring check
            AiMonitoringService.runEventTriggeredCheck('PO_RECEIVED', { poId: id });

            res.json({
                success: true,
                message: `Successfully received and shelved Purchase Order ${po.po_number}!`
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = SupplierController;
