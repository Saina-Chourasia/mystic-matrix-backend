/**
 * MYSTIC MATRIX Deterministic AI Monitoring Service
 * "Mystic AI — The Inventory Oracle"
 *
 * Implements deterministic mathematical calculations, forecasting checks,
 * overstock analytics, supplier risk audits, and potion ingredient shortage detection.
 * LLMs are NEVER used to calculate quantities or prices.
 */

const { getDb } = require('../config/db');
const ForecastingService = require('./forecastingService');
const RecipeService = require('./recipeService');
const ProductModel = require('../models/productModel');
const AiNotificationModel = require('../models/aiNotificationModel');

class AiMonitoringService {
    /**
     * Run complete automated inventory health scan
     * @param {string} triggerType - 'SCHEDULED' | 'MANUAL' | 'COUNTER_SALE' | 'ORDER_CHECKOUT' | 'PO_RECEIVED' | 'STOCK_ADJUSTMENT'
     */
    static runFullInventoryScan(triggerType = 'MANUAL') {
        const startTime = Date.now();
        const db = getDb();

        const allForecasts = ForecastingService.forecastAll();
        const notificationsCreated = [];

        // 1. Check for Out-of-stock and Imminent Stockouts
        const stockoutFindings = this.detectStockoutsAndLowStock(allForecasts);
        for (const finding of stockoutFindings) {
            const notifId = AiNotificationModel.create(finding);
            if (notifId) notificationsCreated.push(finding);
        }

        // 2. Check Overstock & Trapped Working Capital
        const overstockFindings = this.detectOverstockAndTrappedCapital(allForecasts);
        for (const finding of overstockFindings) {
            const notifId = AiNotificationModel.create(finding);
            if (notifId) notificationsCreated.push(finding);
        }

        // 3. Check Demand Velocity Shifts (Spikes & Sudden Drops)
        const velocityFindings = this.detectDemandVelocityShifts();
        for (const finding of velocityFindings) {
            const notifId = AiNotificationModel.create(finding);
            if (notifId) notificationsCreated.push(finding);
        }

        // 4. Check Approaching Halloween Surges
        const seasonalFindings = this.detectSeasonalHalloweenRisks(allForecasts);
        for (const finding of seasonalFindings) {
            const notifId = AiNotificationModel.create(finding);
            if (notifId) notificationsCreated.push(finding);
        }

        // 5. Check Supplier Lead Times & Delivery Delays
        const supplierFindings = this.detectSupplierAndDeliveryRisks();
        for (const finding of supplierFindings) {
            const notifId = AiNotificationModel.create(finding);
            if (notifId) notificationsCreated.push(finding);
        }

        // 6. Check Potion Ingredient Shortages
        const ingredientFindings = this.detectPotionIngredientShortages();
        for (const finding of ingredientFindings) {
            const notifId = AiNotificationModel.create(finding);
            if (notifId) notificationsCreated.push(finding);
        }

        // 7. Check Forecast Outliers / High Volatility Errors
        const forecastErrorFindings = this.detectForecastAccuracyOutliers(allForecasts);
        for (const finding of forecastErrorFindings) {
            const notifId = AiNotificationModel.create(finding);
            if (notifId) notificationsCreated.push(finding);
        }

        const executionMs = Date.now() - startTime;
        const totalFindings = stockoutFindings.length + overstockFindings.length + velocityFindings.length +
            seasonalFindings.length + supplierFindings.length + ingredientFindings.length + forecastErrorFindings.length;

        // Record analysis run in database
        db.prepare(`
            INSERT INTO ai_analysis_runs (trigger_type, findings_count, notifications_created, execution_ms, summary, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
            triggerType,
            totalFindings,
            notificationsCreated.length,
            executionMs,
            `Scan completed in ${executionMs}ms. Detected ${stockoutFindings.length} stockout/low-stock risks, ${overstockFindings.length} overstock warnings, ${ingredientFindings.length} potion shortages, and ${supplierFindings.length} supplier delivery risks.`
        );

        return {
            triggerType,
            executionMs,
            totalFindings,
            notificationsCreatedCount: notificationsCreated.length,
            breakdown: {
                stockoutRisks: stockoutFindings.length,
                overstockRisks: overstockFindings.length,
                velocityShifts: velocityFindings.length,
                seasonalHalloweenRisks: seasonalFindings.length,
                supplierRisks: supplierFindings.length,
                potionShortages: ingredientFindings.length,
                forecastOutliers: forecastErrorFindings.length
            },
            summary: `Mystic Oracle audit completed in ${executionMs}ms. Catalog healthy with ${totalFindings} key actionable operational signals identified.`
        };
    }

    /**
     * 1. Detect Out-of-Stock and Critical Depletion Horizon
     */
    static detectStockoutsAndLowStock(forecasts) {
        const findings = [];

        for (const f of forecasts) {
            const { product_id, product_name, current_stock, unit_cost, lead_time_days, predictions, metrics } = f;
            const dailyDemand = metrics.mean_daily_demand || 1;
            const leadTime = lead_time_days || 3;
            const safetyStock = metrics.safety_stock || 10;
            const reorderPoint = metrics.reorder_point || Math.ceil((dailyDemand * leadTime) + safetyStock);

            if (current_stock <= 0) {
                const suggestedQty = Math.max(reorderPoint * 2, 50);
                const estimatedCost = Math.round(suggestedQty * unit_cost);

                findings.push({
                    type: 'OUT_OF_STOCK',
                    severity: 'CRITICAL',
                    title: `Apothecary Emergency: ${product_name} Depleted!`,
                    message: `${product_name} is completely out of stock (0 units). Customers cannot brew or purchase this item. Immediate restock order of ${suggestedQty} units required.`,
                    product_id,
                    dedup_key: `OUT_OF_STOCK:${product_id}`,
                    metadata: {
                        current_stock: 0,
                        suggested_reorder_qty: suggestedQty,
                        unit_cost,
                        estimated_cost: estimatedCost,
                        lead_time_days: leadTime,
                        reorder_point: reorderPoint,
                        safety_stock: safetyStock
                    }
                });
            } else if (predictions.days_until_stockout <= leadTime + 1 || current_stock < reorderPoint) {
                const daysLeft = predictions.days_until_stockout;
                const suggestedQty = Math.max(Math.ceil(reorderPoint - current_stock + (dailyDemand * leadTime)), 25);
                const estimatedCost = Math.round(suggestedQty * unit_cost);
                const isUrgent = daysLeft <= leadTime;

                findings.push({
                    type: isUrgent ? 'STOCKOUT_IMMINENT' : 'LOW_STOCK',
                    severity: isUrgent ? 'CRITICAL' : 'WARNING',
                    title: isUrgent ? `Imminent Stockout Risk: ${product_name}` : `Stock Approaching Reorder Point: ${product_name}`,
                    message: `${product_name} has only ${current_stock} units remaining. At current burn rate (${dailyDemand} units/day), stockout is projected in ${daysLeft} days. Supplier lead time is ${leadTime} days.`,
                    product_id,
                    dedup_key: `${isUrgent ? 'STOCKOUT_IMMINENT' : 'LOW_STOCK'}:${product_id}`,
                    metadata: {
                        current_stock,
                        days_until_stockout: daysLeft,
                        suggested_reorder_qty: suggestedQty,
                        unit_cost,
                        estimated_cost: estimatedCost,
                        lead_time_days: leadTime,
                        reorder_point: reorderPoint,
                        safety_stock: safetyStock
                    }
                });
            }
        }

        return findings;
    }

    /**
     * 2. Detect Overstocked Items and Capital Trapped
     */
    static detectOverstockAndTrappedCapital(forecasts) {
        const findings = [];

        for (const f of forecasts) {
            const { product_id, product_name, current_stock, unit_cost, predictions, metrics } = f;
            const dailyDemand = metrics.mean_daily_demand || 0.1;
            const daysCoverage = dailyDemand > 0 ? current_stock / dailyDemand : 999;

            // Flag items where days coverage exceeds 60 days and current_stock > 100
            if (daysCoverage > 60 && current_stock > 80) {
                const thirtyDayDemand = Math.ceil(dailyDemand * 30);
                const excessUnits = Math.max(0, current_stock - (thirtyDayDemand * 2));
                const capitalTrapped = Math.round(excessUnits * unit_cost);
                const monthlyHoldingCost = Math.round(capitalTrapped * 0.02 * 100) / 100; // 2% monthly storage & holding

                findings.push({
                    type: 'OVERSTOCK_RISK',
                    severity: 'WARNING',
                    title: `Overstock Capital Trapped: ${product_name}`,
                    message: `${product_name} has ${current_stock} units on hand (${Math.round(daysCoverage)} days of demand coverage). Approximately ${capitalTrapped} Gold Galleons in working capital is trapped with ${monthlyHoldingCost}G monthly holding cost.`,
                    product_id,
                    dedup_key: `OVERSTOCK_RISK:${product_id}`,
                    metadata: {
                        current_stock,
                        days_coverage: Math.round(daysCoverage),
                        excess_units: excessUnits,
                        capital_trapped: capitalTrapped,
                        monthly_holding_cost: monthlyHoldingCost,
                        suggested_actions: [
                            'Pause procurement purchase orders',
                            'Create promotional bundle with high-demand potions',
                            'Offer temporary 15% discount for bulk orders'
                        ]
                    }
                });
            }
        }

        return findings;
    }

    /**
     * 3. Detect Sales Velocity Shifts (Spikes > 1.8x or Drops < 0.3x)
     */
    static detectDemandVelocityShifts() {
        const db = getDb();
        const findings = [];

        // Compare 7-day velocity against 90-day baseline per product
        const rows = db.prepare(`
            WITH baseline AS (
                SELECT 
                    product_id,
                    COUNT(DISTINCT sale_date) AS active_days,
                    SUM(quantity) AS total_qty_90d,
                    (CAST(SUM(quantity) AS FLOAT) / 90.0) AS baseline_daily_velocity
                FROM sales
                WHERE sale_date >= date('2026-10-31', '-90 days')
                GROUP BY product_id
            ),
            recent AS (
                SELECT 
                    product_id,
                    SUM(quantity) AS total_qty_7d,
                    (CAST(SUM(quantity) AS FLOAT) / 7.0) AS recent_daily_velocity
                FROM sales
                WHERE sale_date >= date('2026-10-31', '-7 days')
                GROUP BY product_id
            )
            SELECT 
                p.id AS product_id,
                p.name AS product_name,
                p.current_stock,
                p.unit_cost,
                b.baseline_daily_velocity,
                r.recent_daily_velocity,
                (r.recent_daily_velocity / NULLIF(b.baseline_daily_velocity, 0)) AS velocity_ratio
            FROM baseline b
            JOIN recent r ON b.product_id = r.product_id
            JOIN products p ON b.product_id = p.id
            WHERE b.baseline_daily_velocity > 0.5
        `).all();

        for (const row of rows) {
            const ratio = row.velocity_ratio;
            if (ratio >= 1.8) {
                findings.push({
                    type: 'DEMAND_SPIKE',
                    severity: 'INFO',
                    title: `Demand Spike Detected: ${row.product_name}`,
                    message: `Sales velocity for ${row.product_name} surged to ${Number(row.recent_daily_velocity.toFixed(1))} units/day (${Number((ratio * 100 - 100).toFixed(0))}% above 90-day baseline). Monitor stock closely.`,
                    product_id: row.product_id,
                    dedup_key: `DEMAND_SPIKE:${row.product_id}`,
                    metadata: {
                        baseline_daily_velocity: Number(row.baseline_daily_velocity.toFixed(2)),
                        recent_daily_velocity: Number(row.recent_daily_velocity.toFixed(2)),
                        velocity_ratio: Number(ratio.toFixed(2)),
                        current_stock: row.current_stock
                    }
                });
            } else if (ratio <= 0.35 && row.baseline_daily_velocity >= 2.0) {
                findings.push({
                    type: 'DEMAND_DROP',
                    severity: 'INFO',
                    title: `Demand Deceleration: ${row.product_name}`,
                    message: `Sales velocity for ${row.product_name} decreased to ${Number(row.recent_daily_velocity.toFixed(1))} units/day (down ${Number((100 - ratio * 100).toFixed(0))}% from normal baseline). Consider promotional adjustment.`,
                    product_id: row.product_id,
                    dedup_key: `DEMAND_DROP:${row.product_id}`,
                    metadata: {
                        baseline_daily_velocity: Number(row.baseline_daily_velocity.toFixed(2)),
                        recent_daily_velocity: Number(row.recent_daily_velocity.toFixed(2)),
                        velocity_ratio: Number(ratio.toFixed(2)),
                        current_stock: row.current_stock
                    }
                });
            }
        }

        return findings;
    }

    /**
     * 4. Detect Approaching Seasonal Halloween Surges
     */
    static detectSeasonalHalloweenRisks(forecasts) {
        const findings = [];

        for (const f of forecasts) {
            if (f.is_halloween_surge && f.predictions.stock_status !== 'OUT_OF_STOCK') {
                const daysLeft = f.predictions.days_until_stockout;
                const multiplier = f.metrics.seasonal_factor || 2.0;

                if (daysLeft <= 14) {
                    findings.push({
                        type: 'HALLOWEEN_SURGE',
                        severity: 'WARNING',
                        title: `Halloween Surge Approaching: ${f.product_name}`,
                        message: `${f.product_name} demand spikes by ${multiplier}x during Hallowmere festival festivities. At surge rate, current stock (${f.current_stock}) will deplete in ${daysLeft} days.`,
                        product_id: f.product_id,
                        dedup_key: `HALLOWEEN_SURGE:${f.product_id}`,
                        metadata: {
                            current_stock: f.current_stock,
                            days_until_stockout: daysLeft,
                            seasonal_multiplier: multiplier,
                            suggested_reorder_qty: f.predictions.suggested_reorder_qty
                        }
                    });
                }
            }
        }

        return findings;
    }

    /**
     * 5. Detect Supplier Lead Times, Delayed POs & Delivery Risks
     */
    static detectSupplierAndDeliveryRisks() {
        const db = getDb();
        const findings = [];

        // Check for delayed or pending purchase orders
        const overduePOs = db.prepare(`
            SELECT 
                po.id,
                po.po_number,
                po.supplier_id,
                s.name AS supplier_name,
                s.lead_time_days,
                s.reliability_score,
                po.expected_delivery_date,
                po.total_amount,
                po.status
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.status IN ('SUBMITTED', 'IN_TRANSIT', 'PENDING')
        `).all();

        const today = new Date('2026-11-01');

        for (const po of overduePOs) {
            const expDate = new Date(po.expected_delivery_date);
            const diffDays = Math.ceil((today - expDate) / (1000 * 60 * 60 * 24));

            if (diffDays > 0) {
                findings.push({
                    type: 'SUPPLIER_DELAY',
                    severity: 'CRITICAL',
                    title: `Purchase Order Overdue: ${po.po_number}`,
                    message: `Purchase Order ${po.po_number} from ${po.supplier_name} was expected on ${po.expected_delivery_date} and is now ${diffDays} day(s) overdue. Risk of restocking failure.`,
                    product_id: null,
                    dedup_key: `SUPPLIER_DELAY:${po.id}`,
                    metadata: {
                        po_id: po.id,
                        po_number: po.po_number,
                        supplier_name: po.supplier_name,
                        overdue_days: diffDays,
                        reliability_score: po.reliability_score
                    }
                });
            } else if (po.reliability_score < 0.90) {
                findings.push({
                    type: 'SUPPLIER_RISK',
                    severity: 'INFO',
                    title: `Supplier Reliability Alert: ${po.supplier_name}`,
                    message: `Active shipment ${po.po_number} is from ${po.supplier_name}, who maintains a lower reliability score of ${Math.round(po.reliability_score * 100)}%. Confirm arrival schedule.`,
                    product_id: null,
                    dedup_key: `SUPPLIER_RISK:${po.supplier_id}`,
                    metadata: {
                        po_id: po.id,
                        supplier_name: po.supplier_name,
                        reliability_score: po.reliability_score
                    }
                });
            }
        }

        return findings;
    }

    /**
     * 6. Detect Potion Ingredient Shortages
     */
    static detectPotionIngredientShortages() {
        const findings = [];
        const recipes = RecipeService.getAllRecipes();

        for (const r of recipes) {
            if (r.max_craftable <= 5) {
                const isCompletelyBlocked = r.max_craftable === 0;
                findings.push({
                    type: 'INGREDIENT_SHORTAGE',
                    severity: isCompletelyBlocked ? 'CRITICAL' : 'WARNING',
                    title: isCompletelyBlocked ? `Brewing Halted: ${r.potion_name}` : `Low Brewing Capacity: ${r.potion_name}`,
                    message: isCompletelyBlocked
                        ? `Apothecary cannot brew any batches of ${r.potion_name}! Blocked by missing ingredient: ${r.limiting_ingredient}.`
                        : `Only ${r.max_craftable} batch(es) of ${r.potion_name} can be brewed before reagent ${r.limiting_ingredient} is completely depleted.`,
                    product_id: r.potion_product_id,
                    dedup_key: `INGREDIENT_SHORTAGE:${r.potion_product_id}`,
                    metadata: {
                        potion_id: r.potion_product_id,
                        potion_name: r.potion_name,
                        limiting_ingredient: r.limiting_ingredient,
                        max_craftable: r.max_craftable,
                        shortages: r.shortages || []
                    }
                });
            }
        }

        return findings;
    }

    /**
     * 7. Detect High Volatility / Forecast Accuracy Outliers
     */
    static detectForecastAccuracyOutliers(forecasts) {
        const findings = [];

        for (const f of forecasts) {
            const bestEval = f.backtest_evaluations && f.backtest_evaluations[0];
            if (bestEval && bestEval.wape > 120 && f.metrics.std_dev_daily_demand > 5) {
                findings.push({
                    type: 'FORECAST_VOLATILITY',
                    severity: 'INFO',
                    title: `Erratic Demand Volatility: ${f.product_name}`,
                    message: `${f.product_name} exhibits high demand variance (WAPE: ${bestEval.wape}%, std dev: ${f.metrics.std_dev_daily_demand}). Increased safety stock buffer recommended.`,
                    product_id: f.product_id,
                    dedup_key: `FORECAST_VOLATILITY:${f.product_id}`,
                    metadata: {
                        wape: bestEval.wape,
                        std_dev: f.metrics.std_dev_daily_demand,
                        recommended_safety_stock: Math.ceil(f.metrics.safety_stock * 1.5)
                    }
                });
            }
        }

        return findings;
    }

    /**
     * Asynchronous event hook called when inventory or sales change
     */
    static runEventTriggeredCheck(eventType, payload = {}) {
        // Run in background without blocking caller
        setImmediate(() => {
            try {
                this.runFullInventoryScan(eventType);
            } catch (err) {
                console.error(`[AI Monitor] Error during ${eventType} event scan:`, err.message);
            }
        });
    }

    /**
     * Deterministic Restock Calculation & Justification Generator
     */
    static calculateRestockDetails(productId) {
        const product = ProductModel.getById(productId);
        if (!product) throw new Error(`Product ${productId} not found`);

        const forecast = ForecastingService.forecastProduct(productId);
        const dailyDemand = Math.max(0.5, forecast.metrics.mean_daily_demand || 1);
        const leadTime = forecast.metrics.lead_time_days || 3;
        const stdDev = forecast.metrics.std_dev_daily_demand || 2;
        
        // Safety Stock formula: Z * sigma_L = 1.65 * stdDev * sqrt(L)
        const safetyStock = Math.ceil(1.65 * stdDev * Math.sqrt(leadTime));
        // Reorder Point: (d * L) + SS
        const leadTimeDemand = Math.ceil(dailyDemand * leadTime);
        const reorderPoint = leadTimeDemand + safetyStock;

        // Inventory Position: Available + On-Order
        const db = getDb();
        const onOrderRow = db.prepare(`
            SELECT COALESCE(SUM(poi.quantity_ordered), 0) AS on_order_qty
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.purchase_order_id = po.id
            WHERE poi.product_id = ? AND po.status IN ('PENDING', 'SUBMITTED', 'IN_TRANSIT')
        `).get(productId);
        const onOrder = onOrderRow ? onOrderRow.on_order_qty : 0;
        const inventoryPosition = product.current_stock + onOrder;

        // Suggested reorder quantity: order-up-to level (review period = 14 days)
        const reviewPeriodDays = 14;
        const orderUpToLevel = Math.ceil(reorderPoint + (dailyDemand * reviewPeriodDays));
        let suggestedQty = Math.max(0, orderUpToLevel - inventoryPosition);
        if (suggestedQty < 20) suggestedQty = 20;

        const unitCost = Number(product.unit_cost || 0);
        const estimatedCost = Math.round(suggestedQty * unitCost * 100) / 100;

        // Arrival horizon
        const arrivalDate = new Date('2026-11-01');
        arrivalDate.setDate(arrivalDate.getDate() + leadTime);
        const arrivalStr = arrivalDate.toISOString().split('T')[0];

        const daysUntilDepletion = dailyDemand > 0 ? Number((product.current_stock / dailyDemand).toFixed(1)) : 999;

        // Natural-language justification
        const justification = `Madam Hex, inventory of ${product.name} stands at ${product.current_stock} units (with ${onOrder} units currently in transit). At an average daily burn of ${dailyDemand.toFixed(1)} units and a supplier lead time of ${leadTime} days from ${product.supplier_name || 'Hallowmere Guild'}, existing stock will deplete in ${daysUntilDepletion} days. We recommend purchasing ${suggestedQty} units at ${unitCost.toFixed(2)}G each (total: ${estimatedCost.toFixed(2)}G), arriving on ${arrivalStr} to safeguard against stockouts.`;

        return {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            currentStock: product.current_stock,
            onOrderStock: onOrder,
            inventoryPosition,
            projectedDailyDemand: Number(dailyDemand.toFixed(2)),
            leadTimeDays: leadTime,
            safetyStock,
            reorderPoint,
            suggestedOrderQty: suggestedQty,
            unitCost,
            estimatedTotalCost: estimatedCost,
            supplierId: product.supplier_id,
            supplierName: product.supplier_name,
            expectedArrivalDate: arrivalStr,
            daysUntilDepletion,
            justification
        };
    }

    /**
     * Smart Product Ranking & Assortment Optimization
     */
    static getProductRankingsAndAssortment() {
        const db = getDb();
        const rows = db.prepare(`
            WITH sales_agg AS (
                SELECT 
                    product_id,
                    SUM(quantity) AS units_sold_30d,
                    SUM(total_amount) AS revenue_30d
                FROM sales
                WHERE sale_date >= date('2026-10-31', '-30 days')
                GROUP BY product_id
            )
            SELECT 
                p.id,
                p.name,
                p.sku,
                p.item_type,
                p.current_stock,
                p.unit_cost,
                p.selling_price,
                p.is_halloween_surge,
                c.name AS category_name,
                COALESCE(s.units_sold_30d, 0) AS units_sold_30d,
                COALESCE(s.revenue_30d, 0) AS revenue_30d
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN sales_agg s ON p.id = s.product_id
            WHERE p.is_archived = 0
            ORDER BY units_sold_30d DESC
        `).all();

        return rows.map(item => {
            const sellingPrice = Number(item.selling_price || 0);
            const unitCost = Number(item.unit_cost || 0);
            const grossMarginG = sellingPrice - unitCost;
            const grossMarginPct = sellingPrice > 0 ? Number(((grossMarginG / sellingPrice) * 100).toFixed(1)) : 0;
            const totalProfit30d = Number((item.units_sold_30d * grossMarginG).toFixed(2));
            const velocity = Number((item.units_sold_30d / 30).toFixed(2));
            const daysCoverage = velocity > 0 ? Math.round(item.current_stock / velocity) : 999;

            let classification = 'BALANCED';
            let recommendation = 'Maintain inventory monitoring';

            if (item.units_sold_30d >= 80 && grossMarginPct >= 40) {
                classification = 'BESTSELLER';
                recommendation = 'Top revenue driver. Prioritize shelf space and safety stock buffers.';
            } else if (item.is_halloween_surge) {
                classification = 'TRENDING_SURGE';
                recommendation = 'High Halloween seasonal demand. Feature in customer portal banner.';
            } else if (grossMarginPct >= 65 && item.units_sold_30d >= 20) {
                classification = 'HIGH_MARGIN_GEM';
                recommendation = 'Exceptional profitability. Spotlight in customer recommendations.';
            } else if (daysCoverage > 75 && item.current_stock > 100) {
                classification = 'OVERSTOCKED_SLOW';
                recommendation = 'High inventory holding cost. Recommend promotional bundle or markdown.';
            }

            return {
                id: item.id,
                name: item.name,
                sku: item.sku,
                itemType: item.item_type,
                category: item.category_name,
                currentStock: item.current_stock,
                sellingPrice,
                unitCost,
                grossMarginG: Number(grossMarginG.toFixed(2)),
                grossMarginPct,
                unitsSold30d: item.units_sold_30d,
                revenue30d: Number(item.revenue_30d.toFixed(2)),
                totalProfit30d,
                velocity,
                daysCoverage,
                classification,
                recommendation
            };
        });
    }
}

module.exports = AiMonitoringService;
