/**
 * MYSTIC MATRIX Analytics & Intelligence Aggregation Service
 */

const ProductModel = require('../models/productModel');
const SalesModel = require('../models/salesModel');
const ForecastingService = require('./forecastingService');

class AnalyticsService {
    static getDashboardMetrics(options = {}) {
        const products = ProductModel.getAll();
        const forecasts = ForecastingService.forecastAll(options);
        const topSellers = SalesModel.getTopSellers(5);
        const categoryPerf = SalesModel.getCategoryPerformance();

        let totalInventoryCostValue = 0;
        let totalInventoryRetailValue = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let overstockedCount = 0;
        let criticalCount = 0;
        let projected30dUnits = 0;
        let projected30dRevenue = 0;

        for (const f of forecasts) {
            const stock = f.current_stock;
            const cost = f.unit_cost;
            const price = f.selling_price;

            totalInventoryCostValue += stock * cost;
            totalInventoryRetailValue += stock * price;

            projected30dUnits += f.predictions.predicted_30d_demand;
            projected30dRevenue += f.predictions.predicted_30d_demand * price;

            switch (f.predictions.stock_status) {
                case 'OUT_OF_STOCK':
                    outOfStockCount++;
                    break;
                case 'CRITICAL':
                    criticalCount++;
                    break;
                case 'LOW_STOCK':
                    lowStockCount++;
                    break;
                case 'OVERSTOCKED':
                    overstockedCount++;
                    break;
            }
        }

        // Inventory Health Index (0 to 100)
        // 1. Availability Score (40%): Fraction of products not out of stock or critical
        const totalCount = products.length || 1;
        const availableItems = totalCount - (outOfStockCount + criticalCount);
        const availabilityScore = Math.max(0, (availableItems / totalCount) * 100);

        // 2. Overstock Health (30%): Fraction of products not excessively overstocked
        const nonOverstocked = totalCount - overstockedCount;
        const overstockScore = Math.max(0, (nonOverstocked / totalCount) * 100);

        // 3. Stock Buffer Health (30%): Fraction of products with > 5 days inventory
        const safeBufferItems = forecasts.filter(f => f.predictions.days_until_stockout > 5).length;
        const bufferScore = (safeBufferItems / totalCount) * 100;

        const healthScore = Math.round((availabilityScore * 0.4) + (overstockScore * 0.3) + (bufferScore * 0.3));

        let healthGrade = 'S';
        let healthLabel = 'Enchanted Balance';
        if (healthScore >= 90) { healthGrade = 'A+'; healthLabel = 'Supreme Harmony'; }
        else if (healthScore >= 80) { healthGrade = 'A'; healthLabel = 'Enchanted Balance'; }
        else if (healthScore >= 70) { healthGrade = 'B'; healthLabel = 'Minor Hex Detected'; }
        else if (healthScore >= 60) { healthGrade = 'C'; healthLabel = 'Apothecary Volatility'; }
        else { healthGrade = 'D'; healthLabel = 'Critical Curse Imminent'; }

        // Halloween surge items needing attention
        const halloweenAttentionItems = forecasts.filter(f => f.is_halloween_surge && (f.predictions.stock_status === 'CRITICAL' || f.predictions.stock_status === 'LOW_STOCK'));

        return {
            summary: {
                total_products: totalCount,
                total_inventory_cost_value: Math.round(totalInventoryCostValue),
                total_inventory_retail_value: Math.round(totalInventoryRetailValue),
                potential_profit_margin: totalInventoryRetailValue > 0 
                    ? Math.round(((totalInventoryRetailValue - totalInventoryCostValue) / totalInventoryRetailValue) * 100) 
                    : 0,
                low_stock_count: lowStockCount,
                out_of_stock_count: outOfStockCount,
                critical_count: criticalCount,
                overstocked_count: overstockedCount,
                healthy_count: totalCount - (lowStockCount + outOfStockCount + criticalCount + overstockedCount),
                projected_30d_demand_units: Math.round(projected30dUnits),
                projected_30d_revenue: Math.round(projected30dRevenue),
                health_index: {
                    score: healthScore,
                    grade: healthGrade,
                    label: healthLabel,
                    breakdown: {
                        availability_score: Math.round(availabilityScore),
                        overstock_score: Math.round(overstockScore),
                        buffer_score: Math.round(bufferScore)
                    }
                }
            },
            halloween_surge_summary: {
                active: true,
                surge_items_at_risk_count: halloweenAttentionItems.length,
                urgent_items: halloweenAttentionItems.map(item => ({
                    id: item.product_id,
                    name: item.product_name,
                    stock: item.current_stock,
                    days_remaining: item.predictions.days_until_stockout,
                    surge_factor: item.metrics.seasonal_factor,
                    reorder_qty: item.predictions.suggested_reorder_qty
                }))
            },
            top_sellers: topSellers,
            category_performance: categoryPerf
        };
    }

    static getSalesAnalytics(days = 30) {
        const { getDb } = require('../config/db');
        const db = getDb();
        const dailySales = SalesModel.getOverallDailySales(days);
        const topSellers = SalesModel.getTopSellers(8);
        const categoryPerf = SalesModel.getCategoryPerformance();

        // Customer portal orders overview
        const orderSummary = db.prepare(`
            SELECT 
                COUNT(*) as customer_orders_count,
                ROUND(COALESCE(SUM(total_amount), 0), 2) as customer_orders_revenue,
                ROUND(COALESCE(AVG(total_amount), 0), 2) as average_order_value
            FROM orders
        `).get();

        // Sales provenance breakdown
        const provenanceBreakdown = db.prepare(`
            SELECT 
                COALESCE(provenance, 'DEMO_POTION_SHOP') as provenance,
                COUNT(*) as transaction_count,
                SUM(quantity) as units_sold,
                ROUND(SUM(total_amount), 2) as total_revenue
            FROM sales
            GROUP BY COALESCE(provenance, 'DEMO_POTION_SHOP')
        `).all();

        return {
            timeline: dailySales,
            top_sellers: topSellers,
            categories: categoryPerf,
            customer_orders: orderSummary,
            provenance_breakdown: provenanceBreakdown
        };
    }
}

module.exports = AnalyticsService;

