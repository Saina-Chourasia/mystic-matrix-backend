/**
 * MYSTIC MATRIX AI Action Controller
 * Level 3 Action Approval Guardrail execution logic
 */

const { getDb } = require('../config/db');
const AiActionModel = require('../models/aiActionModel');
const ProductModel = require('../models/productModel');

class AiActionController {
    /**
     * List action proposals
     */
    static getActions(req, res, next) {
        try {
            const { status, limit = 50, offset = 0 } = req.query;
            const actions = AiActionModel.getAll({ status, limit, offset });
            res.json({ success: true, actions });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Create draft proposal
     */
    static createDraft(req, res, next) {
        try {
            const { action_type, target_entity, title, proposed_payload, justification } = req.body;
            if (!action_type || !target_entity || !title || !proposed_payload || !justification) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required proposal fields: action_type, target_entity, title, proposed_payload, justification.'
                });
            }

            const draft = AiActionModel.createDraft({
                action_type,
                target_entity,
                title,
                proposed_payload,
                justification,
                requested_by: req.user ? req.user.email : 'Mystic AI Oracle'
            });

            res.status(201).json({
                success: true,
                message: `Draft action #${draft.id} successfully registered for Madam Hex review.`,
                action: draft
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Approve and execute action
     */
    static approve(req, res, next) {
        try {
            const { id } = req.params;
            const action = AiActionModel.getById(id);
            if (!action) {
                return res.status(404).json({ success: false, message: `Action proposal #${id} not found.` });
            }

            if (action.status !== 'PENDING') {
                return res.status(400).json({
                    success: false,
                    message: `Action #${id} cannot be approved because its status is already '${action.status}'.`
                });
            }

            const adminUser = req.user ? req.user.email : 'Madam Hex (Admin)';
            const db = getDb();
            const payload = action.proposed_payload || {};

            // Execute specific action based on type
            let executionResult = null;

            if (action.action_type === 'DRAFT_RESTOCK_PO') {
                const productId = payload.productId;
                const quantity = parseInt(payload.quantity || 50, 10);
                const unitCost = Number(payload.unitCost || 10);
                const totalCost = Number(payload.totalCost || (quantity * unitCost));

                // Find supplier
                let supplierId = payload.supplierId;
                if (!supplierId && productId) {
                    const prod = ProductModel.getById(productId);
                    supplierId = prod ? prod.supplier_id : 1;
                }
                if (!supplierId) supplierId = 1;

                const poNumber = `PO-ORACLE-${Date.now().toString().slice(-6)}`;
                const expectedDelivery = new Date();
                expectedDelivery.setDate(expectedDelivery.getDate() + (payload.leadTimeDays || 3));
                const expectedDateStr = expectedDelivery.toISOString().split('T')[0];

                const poStmt = db.prepare(`
                    INSERT INTO purchase_orders (po_number, supplier_id, status, total_amount, expected_delivery_date, submitted_at, notes, created_at, updated_at)
                    VALUES (?, ?, 'SUBMITTED', ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `);
                const poRes = poStmt.run(poNumber, supplierId, totalCost, expectedDateStr, `AI Oracle Restock Order approved by ${adminUser}: ${action.title}`);
                const poId = poRes.lastInsertRowid;

                if (productId) {
                    db.prepare(`
                        INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, unit_cost, total_cost, created_at)
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `).run(poId, productId, quantity, unitCost, totalCost);
                }

                executionResult = {
                    poId,
                    poNumber,
                    supplierId,
                    totalCost,
                    expectedDeliveryDate: expectedDateStr
                };

            } else if (action.action_type === 'ADJUST_REORDER_POINT') {
                const productId = payload.productId;
                const newRop = parseInt(payload.newReorderPoint, 10);
                if (productId && !isNaN(newRop)) {
                    db.prepare('UPDATE products SET reorder_point = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newRop, productId);
                    executionResult = { productId, newReorderPoint: newRop };
                }

            } else if (action.action_type === 'ADJUST_SAFETY_STOCK') {
                const productId = payload.productId;
                const newSafetyStock = parseInt(payload.newSafetyStock, 10);
                if (productId && !isNaN(newSafetyStock)) {
                    db.prepare('UPDATE products SET safety_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newSafetyStock, productId);
                    executionResult = { productId, newSafetyStock };
                }

            } else if (action.action_type === 'LAUNCH_PROMOTION') {
                executionResult = {
                    message: 'Promotional bundle campaign registered for customer store.',
                    details: payload
                };
            }

            // Mark action as approved and executed
            AiActionModel.markApproved(id, adminUser);
            const updated = AiActionModel.markExecuted(id);

            // Audit log
            db.prepare(`
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, created_at)
                VALUES (?, ?, 'AI_AGENT', ?, ?, CURRENT_TIMESTAMP)
            `).run(
                req.user ? req.user.id : null,
                `AI_ACTION_APPROVED_${action.action_type}`,
                String(id),
                JSON.stringify({ adminUser, executionResult })
            );

            res.json({
                success: true,
                message: `Action #${id} approved and executed successfully by ${adminUser}.`,
                action: updated,
                executionResult
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Reject action proposal
     */
    static reject(req, res, next) {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const adminUser = req.user ? req.user.email : 'Madam Hex (Admin)';

            const action = AiActionModel.getById(id);
            if (!action) {
                return res.status(404).json({ success: false, message: `Action proposal #${id} not found.` });
            }

            const updated = AiActionModel.reject(id, reason || 'Rejected by Madam Hex', adminUser);

            res.json({
                success: true,
                message: `Action #${id} rejected.`,
                action: updated
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = AiActionController;
