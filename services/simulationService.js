const ProductModel = require('../models/productModel');
const ForecastingService = require('./forecastingService');
const RecipeService = require('./recipeService');

/**
 * SimulationService — The Magic Market Simulator
 * Runs pure in-memory What-If scenario simulations without modifying live SQLite inventory.
 */
class SimulationService {
    static getScenarios() {
        return [
            {
                id: 'normal',
                name: 'Quiet Waning Moon (Baseline)',
                description: 'Standard calm autumn trading in Hallowmere. No delivery delays.',
                demandMultiplier: 1.0,
                supplierDelayDays: 0,
                costAdjustmentPct: 0,
                safetyStockZ: 1.65 // 95% service level
            },
            {
                id: 'coven_gathering',
                name: 'Midnight Coven Gathering',
                description: 'Witches gather from nearby valleys. Reagent sales spike 1.8x with minor 2-day delivery delays.',
                demandMultiplier: 1.8,
                supplierDelayDays: 2,
                costAdjustmentPct: 5,
                safetyStockZ: 1.96 // 97.5% service level
            },
            {
                id: 'halloween_sabbat',
                name: 'Halloween Grand Sabbat Surge',
                description: 'Catastrophic Halloween demand spike (3.0x). Diagon Alley suppliers experience 4-day carriage delays and 20% ingredient price hikes.',
                demandMultiplier: 3.0,
                supplierDelayDays: 4,
                costAdjustmentPct: 20,
                safetyStockZ: 2.33 // 99% service level
            },
            {
                id: 'dragon_storm',
                name: 'Dragon Fleet Storm Embargo',
                description: 'Severe magical storms block transport across the astral sea. 8-day supply delays with 30% cost inflation.',
                demandMultiplier: 1.5,
                supplierDelayDays: 8,
                costAdjustmentPct: 30,
                safetyStockZ: 2.58 // 99.5% service level
            }
        ];
    }

    /**
     * Run simulation and generate Current vs Simulated comparison
     */
    static runSimulation({
        demandMultiplier = 1.0,
        supplierDelayDays = 0,
        safetyStockZ = 1.65,
        costAdjustmentPct = 0,
        selectedCategory = 'ALL',
        selectedProductId = null
    } = {}) {
        const mult = Math.max(0.5, Math.min(4.0, parseFloat(demandMultiplier) || 1.0));
        const delay = Math.max(0, Math.min(21, parseInt(supplierDelayDays, 10) || 0));
        const costAdj = parseFloat(costAdjustmentPct) || 0;
        const zScore = parseFloat(safetyStockZ) || 1.65;

        // Fetch products
        let products = ProductModel.getAll({ includeArchived: false });
        if (selectedProductId) {
            products = products.filter(p => p.id === parseInt(selectedProductId, 10));
        } else if (selectedCategory !== 'ALL') {
            products = products.filter(p => 
                (selectedCategory === 'ingredients' && (p.category_id === 1 || p.item_type === 'ingredient')) ||
                (selectedCategory === 'potions' && (p.category_id === 2 || p.item_type === 'potion'))
            );
        }

        // Get forecasts for baseline (1.0x) and simulated (mult)
        const baselineForecasts = ForecastingService.forecastAll({ halloweenMultiplier: 1.0 });
        const simulatedForecasts = ForecastingService.forecastAll({ halloweenMultiplier: mult });

        const baseMap = new Map();
        for (const f of baselineForecasts) baseMap.set(f.product_id, f);

        const simMap = new Map();
        for (const f of simulatedForecasts) simMap.set(f.product_id, f);

        let baseTotalDemand30 = 0;
        let simTotalDemand30 = 0;
        let baseProcurementCost = 0.0;
        let simProcurementCost = 0.0;
        let baseStockoutCount = 0;
        let simStockoutCount = 0;
        let baseTotalDays = 0;
        let simTotalDays = 0;

        const productComparisons = [];
        const newlyCriticalItems = [];

        for (const p of products) {
            const baseF = baseMap.get(p.id);
            const simF = simMap.get(p.id);
            if (!baseF || !simF) continue;

            const currentStock = p.current_stock;
            const unitCost = p.unit_cost || 10;
            const simUnitCost = Number((unitCost * (1 + costAdj / 100)).toFixed(2));

            // Baseline calculations
            const baseDemand30 = baseF.predictions.predicted_30d_demand;
            const baseDailyDemand = Math.max(0.1, baseDemand30 / 30);
            const baseDaysRemaining = Number((currentStock / baseDailyDemand).toFixed(1));
            const baseLeadTime = p.lead_time_days || 3;
            const baseROP = baseF.metrics.reorder_point;
            const baseReorderQty = baseF.predictions.suggested_reorder_qty;
            const baseCost = baseReorderQty * unitCost;

            baseTotalDemand30 += baseDemand30;
            baseProcurementCost += baseCost;
            baseTotalDays += baseDaysRemaining;
            if (baseDaysRemaining <= 3 || currentStock <= 0) baseStockoutCount++;

            // Simulated calculations
            const simDemand30 = simF.predictions.predicted_30d_demand;
            const simDailyDemand = Math.max(0.1, simDemand30 / 30);
            const simDaysRemaining = Number((currentStock / simDailyDemand).toFixed(1));
            const simLeadTime = baseLeadTime + delay;

            // Simulated Safety Stock and ROP accounting for extra lead time & volatility
            const stdDev = simF.metrics.std_dev_daily_demand;
            const simSafetyStock = Math.ceil(zScore * stdDev * Math.sqrt(simLeadTime));
            const simLeadTimeDemand = Math.ceil(simDailyDemand * simLeadTime);
            const simROP = simLeadTimeDemand + simSafetyStock;
            const simReorderQty = Math.max(0, simROP - currentStock + simLeadTimeDemand);
            const simCost = simReorderQty * simUnitCost;

            simTotalDemand30 += simDemand30;
            simProcurementCost += simCost;
            simTotalDays += simDaysRemaining;

            let simRiskCategory = 'LOW';
            if (currentStock <= 0 || simDaysRemaining <= 3) {
                simRiskCategory = 'CRITICAL';
                simStockoutCount++;
            } else if (simDaysRemaining <= 7) {
                simRiskCategory = 'HIGH';
            } else if (simDaysRemaining <= 14) {
                simRiskCategory = 'MODERATE';
            }

            const isNewlyCritical = (baseDaysRemaining > 3) && (simDaysRemaining <= 3);
            if (isNewlyCritical) {
                newlyCriticalItems.push({
                    productId: p.id,
                    name: p.name,
                    currentStock,
                    baseDaysRemaining,
                    simDaysRemaining,
                    simDemand30,
                    suggestedOrder: simReorderQty
                });
            }

            productComparisons.push({
                productId: p.id,
                name: p.name,
                sku: p.sku,
                categoryName: p.category_name,
                currentStock,
                baseline: {
                    demand30: baseDemand30,
                    daysRemaining: baseDaysRemaining,
                    rop: baseROP,
                    reorderQty: baseReorderQty,
                    procurementCost: Math.round(baseCost * 100) / 100,
                    riskCategory: baseDaysRemaining <= 3 ? 'CRITICAL' : baseDaysRemaining <= 7 ? 'HIGH' : 'LOW'
                },
                simulated: {
                    demand30: simDemand30,
                    daysRemaining: simDaysRemaining,
                    effectiveLeadTimeDays: simLeadTime,
                    safetyStock: simSafetyStock,
                    rop: simROP,
                    reorderQty: simReorderQty,
                    unitCost: simUnitCost,
                    procurementCost: Math.round(simCost * 100) / 100,
                    riskCategory: simRiskCategory,
                    isNewlyCritical
                }
            });
        }

        // Potion Production Feasibility under Simulated conditions
        const recipes = RecipeService.getAllRecipes();
        const potionFeasibility = recipes.map(r => {
            const prod = products.find(p => p.id === r.potion_product_id);
            const simDemand = prod ? Math.round((prod.selling_price || 30) * mult) : 50;
            return {
                potionName: r.potion_name,
                maxCraftableNow: r.max_craftable,
                limitingIngredient: r.limiting_ingredient,
                simulatedFeasibilityStatus: r.max_craftable >= 20 ? 'HIGH' : r.max_craftable >= 5 ? 'CONSTRAINED' : 'CRITICAL_SHORTAGE'
            };
        });

        const productCount = products.length || 1;

        return {
            parameters: {
                demandMultiplier: mult,
                supplierDelayDays: delay,
                safetyStockZ: zScore,
                costAdjustmentPct: costAdj,
                selectedCategory,
                isModified: mult !== 1.0 || delay !== 0 || costAdj !== 0
            },
            summary: {
                totalProductsSimulated: productCount,
                baselineDemand30: baseTotalDemand30,
                simulatedDemand30: simTotalDemand30,
                demandSurgePct: Math.round(((simTotalDemand30 - baseTotalDemand30) / (baseTotalDemand30 || 1)) * 100),
                baselineStockoutCount: baseStockoutCount,
                simulatedStockoutCount: simStockoutCount,
                newStockoutCount: Math.max(0, simStockoutCount - baseStockoutCount),
                baselineProcurementCost: Math.round(baseProcurementCost * 100) / 100,
                simulatedProcurementCost: Math.round(simProcurementCost * 100) / 100,
                additionalBudgetRequired: Math.round((simProcurementCost - baseProcurementCost) * 100) / 100,
                baselineAverageDaysOfStock: Number((baseTotalDays / productCount).toFixed(1)),
                simulatedAverageDaysOfStock: Number((simTotalDays / productCount).toFixed(1))
            },
            newlyCriticalItems,
            potionFeasibility,
            productComparisons
        };
    }
}

module.exports = SimulationService;

