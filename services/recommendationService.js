/**
 * MYSTIC MATRIX Smart Recommendations Service
 * Translates statistical forecasts into high-impact, actionable wizarding business decisions.
 */

const ForecastingService = require('./forecastingService');
const ProductModel = require('../models/productModel');
const TransactionModel = require('../models/transactionModel');

class RecommendationService {
    static getRecommendations(options = {}) {
        const forecasts = ForecastingService.forecastAll(options);
        const recommendations = [];

        for (const item of forecasts) {
            const { product_id, product_name, current_stock, unit_cost, supplier_name, lead_time_days, predictions, metrics, is_halloween_surge } = item;

            // 1. Critical Stockout & Urgent Restock Recommendation
            if (predictions.stock_status === 'CRITICAL' || predictions.stock_status === 'OUT_OF_STOCK') {
                const isHalloweenRelated = is_halloween_surge;
                recommendations.push({
                    id: `rec-critical-${product_id}`,
                    product_id,
                    product_name,
                    category: item.category_name,
                    priority: 'CRITICAL',
                    type: 'URGENT_RESTOCK',
                    title: `Emergency Restock Required: ${product_name}`,
                    message: `${product_name} has only ${current_stock} units left on apothecary shelves. At projected demand (${metrics.projected_daily_rate} units/day), complete stockout occurs in ${predictions.days_until_stockout} days!`,
                    supplier: supplier_name,
                    lead_time: lead_time_days,
                    suggested_action: 'Place emergency order immediately',
                    suggested_quantity: Math.max(predictions.suggested_reorder_qty, 50),
                    estimated_cost: Math.round(Math.max(predictions.suggested_reorder_qty, 50) * unit_cost),
                    confidence: 0.98,
                    badge: isHalloweenRelated ? 'Halloween Emergency' : 'Stockout Alert'
                });
            }

            // 2. High Priority Halloween Surge Recommendation
            else if (is_halloween_surge && predictions.stock_status === 'LOW_STOCK') {
                recommendations.push({
                    id: `rec-surge-${product_id}`,
                    product_id,
                    product_name,
                    category: item.category_name,
                    priority: 'HIGH',
                    type: 'SEASONAL_SURGE',
                    title: `Halloween Surge Approaching: ${product_name}`,
                    message: `Historical demand for ${product_name} peaks at ${metrics.seasonal_factor}x during the Halloween coven gatherings. Current stock (${current_stock}) will be breached within ${predictions.days_until_stockout} days.`,
                    supplier: supplier_name,
                    lead_time: lead_time_days,
                    suggested_action: `Order ${predictions.suggested_reorder_qty} units before Halloween Eve`,
                    suggested_quantity: predictions.suggested_reorder_qty,
                    estimated_cost: predictions.estimated_reorder_cost,
                    confidence: 0.94,
                    badge: 'Halloween Spike'
                });
            }

            // 3. Overstock & Capital Trapped Warning
            else if (predictions.stock_status === 'OVERSTOCKED') {
                const capitalTrapped = Math.round(current_stock * unit_cost);
                recommendations.push({
                    id: `rec-overstock-${product_id}`,
                    product_id,
                    product_name,
                    category: item.category_name,
                    priority: 'MEDIUM',
                    type: 'OVERSTOCK_WARNING',
                    title: `Halt Purchases: ${product_name} Overstocked`,
                    message: `Excess inventory of ${current_stock} units detected. Projected 30-day demand is only ${predictions.predicted_30d_demand} units. ${capitalTrapped} Gold Galleons in working capital are currently tied up.`,
                    supplier: supplier_name,
                    suggested_action: 'Pause procurement orders and introduce promotional bundling with fast-moving potions',
                    suggested_quantity: 0,
                    estimated_cost: 0,
                    confidence: 0.91,
                    badge: 'Capital Trapped'
                });
            }

            // 4. Upward Demand Trend Alert
            else if (metrics.trend_label === 'Rapidly Rising' || metrics.trend_label === 'Rising') {
                recommendations.push({
                    id: `rec-trend-${product_id}`,
                    product_id,
                    product_name,
                    category: item.category_name,
                    priority: 'INFO',
                    type: 'GROWTH_TREND',
                    title: `Rising Popularity: ${product_name}`,
                    message: `${product_name} shows steady velocity expansion (+${Math.round(metrics.trend_factor * 100)}% trend factor). Reorder point adjusted up to ${predictions.reorder_point} to ensure safety buffer.`,
                    supplier: supplier_name,
                    suggested_action: 'Monitor weekly sales and verify supplier lead times',
                    suggested_quantity: predictions.suggested_reorder_qty,
                    estimated_cost: predictions.estimated_reorder_cost,
                    confidence: 0.88,
                    badge: 'Trend Expanding'
                });
            }

            // 5. Optimal Inventory Affirmation
            else if (predictions.stock_status === 'HEALTHY' && (product_name === 'Dragon Scales' || product_name === 'Healing Potion' || product_name === 'Witch Hazel')) {
                recommendations.push({
                    id: `rec-optimal-${product_id}`,
                    product_id,
                    product_name,
                    category: item.category_name,
                    priority: 'INFO',
                    type: 'OPTIMAL_STATUS',
                    title: `Optimal Stock Balance: ${product_name}`,
                    message: `${product_name} has ideal inventory levels (${current_stock} units), perfectly covering expected 30-day demand without excess holding risk.`,
                    supplier: supplier_name,
                    suggested_action: 'Maintain current procurement schedule',
                    suggested_quantity: 0,
                    estimated_cost: 0,
                    confidence: 0.95,
                    badge: 'Balanced'
                });
            }
        }

        // Sort by priority: CRITICAL -> HIGH -> MEDIUM -> INFO
        const priorityOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, INFO: 4 };
        recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return recommendations;
    }

    /**
     * One-click restock application from recommendation
     */
    static applyRestock(productId, quantity, reason = 'Automated recommendation execution') {
        const product = ProductModel.getById(productId);
        if (!product) throw new Error('Product not found');

        const newStock = product.current_stock + parseInt(quantity, 10);
        ProductModel.updateStock(productId, newStock);

        TransactionModel.create({
            product_id: productId,
            type: 'RESTOCK',
            quantity: parseInt(quantity, 10),
            previous_stock: product.current_stock,
            new_stock: newStock,
            reason: reason
        });

        return ProductModel.getById(productId);
    }
}

module.exports = RecommendationService;

