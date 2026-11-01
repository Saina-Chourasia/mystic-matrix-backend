/**
 * MYSTIC MATRIX AI Crystal Ball — Statistical Demand Forecasting Engine
 * 
 * Implements rigorous time-series forecasting:
 * 1. Continuous 90-day time-series reconstruction (with zero-imputation)
 * 2. Model 1: Seasonal Naive Baseline (weekly lag)
 * 3. Model 2: Simple Exponential Smoothing & 7-Day Moving Average
 * 4. Model 3: Holt's Linear Trend Exponential Smoothing (Level & Trend)
 * 5. Model 4: Holt-Winters Additive Exponential Smoothing (with weekly seasonality s=7)
 * 6. Chronological 14-day Holdout Backtesting (prevents future-data leakage)
 * 7. Accuracy Metrics: MAE, WAPE, Forecast Bias, Relative Accuracy vs Baseline
 * 8. 7-Day, 14-Day, and 30-Day Projections with 95% Confidence Intervals
 * 9. Stockout Risk Categorization & Plain-Language Madam Hex Explanations
 */

const SalesModel = require('../models/salesModel');
const ProductModel = require('../models/productModel');
const { getDb } = require('../config/db');

class ForecastingService {
    /**
     * Reconstruct continuous 90-day time-series ending at latest sale date
     */
    static getContinuousDailySeries(productId, days = 90) {
        const rawSales = SalesModel.getProductDailySales(productId, days);
        const endDate = new Date('2026-10-31');
        const salesMap = new Map();
        for (const row of rawSales) {
            salesMap.set(row.sale_date, row.daily_quantity);
        }

        const series = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(endDate);
            d.setDate(endDate.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const qty = salesMap.get(dateStr) || 0;
            series.push({ date: dateStr, quantity: qty });
        }
        return series;
    }

    /**
     * Model 1: Seasonal Naive Baseline (s=7)
     */
    static forecastSeasonalNaive(trainSeries, horizon = 30) {
        const s = 7;
        const n = trainSeries.length;
        const lastCycle = trainSeries.slice(Math.max(0, n - s)).map(p => p.quantity);
        const preds = [];
        for (let k = 0; k < horizon; k++) {
            preds.push(lastCycle[k % lastCycle.length] || 1);
        }
        return preds;
    }

    /**
     * Model 2: Simple Moving Average (SMA-7) & Simple Exponential Smoothing
     */
    static forecastMovingAverage(trainSeries, horizon = 30, windowSize = 7) {
        const n = trainSeries.length;
        const recent = trainSeries.slice(Math.max(0, n - windowSize)).map(p => p.quantity);
        const avg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
        return new Array(horizon).fill(Math.max(0.1, Number(avg.toFixed(2))));
    }

    /**
     * Model 3: Holt's Linear Trend Exponential Smoothing
     */
    static forecastHoltLinear(trainSeries, horizon = 30, alpha = 0.35, beta = 0.15) {
        const quantities = trainSeries.map(p => p.quantity);
        let L = quantities[0] || 1;
        let T = (quantities[Math.min(7, quantities.length - 1)] - quantities[0]) / Math.min(7, quantities.length - 1);

        for (let t = 1; t < quantities.length; t++) {
            const Y_t = quantities[t];
            const prevL = L;
            L = alpha * Y_t + (1 - alpha) * (L + T);
            T = beta * (L - prevL) + (1 - beta) * T;
        }

        L = Math.max(0.1, L);
        T = Math.max(-0.4, Math.min(1.2, T));

        const preds = [];
        for (let k = 1; k <= horizon; k++) {
            const val = Math.max(0.1, L + k * T);
            preds.push(Number(val.toFixed(2)));
        }
        return preds;
    }

    /**
     * Model 4: Holt-Winters Additive Seasonality (s=7)
     */
    static forecastHoltWinters(trainSeries, horizon = 30, alpha = 0.3, beta = 0.1, gamma = 0.2) {
        const s = 7;
        const y = trainSeries.map(p => p.quantity);
        if (y.length < s * 2) {
            return this.forecastHoltLinear(trainSeries, horizon, alpha, beta);
        }

        // Initialize level, trend, and seasonal indices
        let L = y.slice(0, s).reduce((a, b) => a + b, 0) / s;
        let T = (y.slice(s, s * 2).reduce((a, b) => a + b, 0) - y.slice(0, s).reduce((a, b) => a + b, 0)) / (s * s);
        const S = [];
        for (let i = 0; i < s; i++) {
            S[i] = y[i] - L;
        }

        for (let t = s; t < y.length; t++) {
            const Y_t = y[t];
            const seasonIdx = t % s;
            const prevL = L;
            L = alpha * (Y_t - S[seasonIdx]) + (1 - alpha) * (L + T);
            T = beta * (L - prevL) + (1 - beta) * T;
            S[seasonIdx] = gamma * (Y_t - L) + (1 - gamma) * S[seasonIdx];
        }

        L = Math.max(0.1, L);
        T = Math.max(-0.3, Math.min(1.0, T));

        const preds = [];
        for (let k = 1; k <= horizon; k++) {
            const seasonIdx = (y.length + k - 1) % s;
            const val = Math.max(0.1, L + k * T + (S[seasonIdx] || 0));
            preds.push(Number(val.toFixed(2)));
        }
        return preds;
    }

    /**
     * Chronological Backtesting on 14-day holdout set to calculate MAE, WAPE, Bias, Relative Accuracy
     */
    static backtestProduct(productId, holdoutDays = 14) {
        const fullSeries = this.getContinuousDailySeries(productId, 90);
        const trainSeries = fullSeries.slice(0, fullSeries.length - holdoutDays);
        const testSeries = fullSeries.slice(fullSeries.length - holdoutDays);
        const actuals = testSeries.map(p => p.quantity);
        const actualSum = actuals.reduce((a, b) => a + b, 0) || 1;

        const models = [
            { name: 'Seasonal Naive Baseline', preds: this.forecastSeasonalNaive(trainSeries, holdoutDays) },
            { name: '7-Day Moving Average', preds: this.forecastMovingAverage(trainSeries, holdoutDays) },
            { name: 'Holts Linear Trend', preds: this.forecastHoltLinear(trainSeries, holdoutDays) },
            { name: 'Holt-Winters Additive', preds: this.forecastHoltWinters(trainSeries, holdoutDays) }
        ];

        let baselineMAE = null;

        const evaluated = models.map((m) => {
            let absErrorSum = 0;
            let errorSum = 0;

            for (let i = 0; i < actuals.length; i++) {
                const act = actuals[i];
                const pred = m.preds[i] || 0;
                const err = pred - act;
                absErrorSum += Math.abs(err);
                errorSum += err;
            }

            const mae = Number((absErrorSum / actuals.length).toFixed(2));
            const wape = Number(((absErrorSum / actualSum) * 100).toFixed(1));
            const bias = Number(((errorSum / actualSum) * 100).toFixed(1));

            if (m.name === 'Seasonal Naive Baseline') {
                baselineMAE = mae;
            }

            return {
                modelName: m.name,
                mae,
                wape,
                bias,
                predictions: m.preds
            };
        });

        // Compute relative accuracy vs baseline model
        const evaluatedWithRelative = evaluated.map(m => {
            const rel = baselineMAE && baselineMAE > 0
                ? Number(Math.max(0, (1 - m.mae / baselineMAE) * 100).toFixed(1))
                : 50.0;
            return { ...m, relativeAccuracyPct: rel };
        });

        // Sort by lowest MAE to identify best model
        evaluatedWithRelative.sort((a, b) => a.mae - b.mae);
        evaluatedWithRelative[0].isBest = true;

        return {
            productId,
            holdoutDays,
            actuals,
            bestModel: evaluatedWithRelative[0].modelName,
            evaluations: evaluatedWithRelative
        };
    }

    /**
     * Compute production forecast for product with configurable Halloween surge assumption
     */
    static forecastProduct(productId, options = {}) {
        const product = ProductModel.getById(productId);
        if (!product) {
            throw new Error(`Product with ID ${productId} not found.`);
        }

        const halloweenMultiplier = options.halloweenMultiplier !== undefined ? options.halloweenMultiplier : 1.0;
        const requestedModel = options.model || 'auto'; // 'auto' | 'holt_linear' | 'holt_winters' | 'moving_average' | 'naive'

        // 1. Reconstruct 90-day time series
        const continuousSeries = this.getContinuousDailySeries(productId, 90);
        const quantities = continuousSeries.map(s => s.quantity);

        // 2. Statistical baseline variance & volatility
        const sum = quantities.reduce((a, b) => a + b, 0);
        const meanDailyDemand = Number((sum / (quantities.length || 1)).toFixed(2));
        const variance = quantities.reduce((acc, val) => acc + Math.pow(val - meanDailyDemand, 2), 0) / (quantities.length || 1);
        const stdDevDailyDemand = Number(Math.sqrt(variance).toFixed(2));

        // 3. Chronological Backtest to determine best model & benchmark accuracy
        const backtest = this.backtestProduct(productId, 14);

        // 4. Generate candidate 30-day forecasts from all 4 models
        const naive30 = this.forecastSeasonalNaive(continuousSeries, 30);
        const sma30 = this.forecastMovingAverage(continuousSeries, 30);
        const holtLinear30 = this.forecastHoltLinear(continuousSeries, 30);
        const holtWinters30 = this.forecastHoltWinters(continuousSeries, 30);

        // Select active model
        let activeModelName = backtest.bestModel;
        let selectedForecast30 = holtWinters30;

        if (requestedModel === 'naive') {
            activeModelName = 'Seasonal Naive Baseline';
            selectedForecast30 = naive30;
        } else if (requestedModel === 'moving_average') {
            activeModelName = '7-Day Moving Average';
            selectedForecast30 = sma30;
        } else if (requestedModel === 'holt_linear') {
            activeModelName = 'Holts Linear Trend';
            selectedForecast30 = holtLinear30;
        } else if (requestedModel === 'holt_winters') {
            activeModelName = 'Holt-Winters Additive';
            selectedForecast30 = holtWinters30;
        } else {
            // Auto selection based on best backtest model
            const bestEval = backtest.evaluations[0];
            activeModelName = bestEval.modelName;
            if (activeModelName === 'Seasonal Naive Baseline') selectedForecast30 = naive30;
            else if (activeModelName === '7-Day Moving Average') selectedForecast30 = sma30;
            else if (activeModelName === 'Holts Linear Trend') selectedForecast30 = holtLinear30;
            else selectedForecast30 = holtWinters30;
        }

        // 5. Apply seasonal Halloween assumption multiplier if active
        let seasonalEventFactor = 1.0;
        if (product.is_halloween_surge) {
            if (product.name === 'Love Potion') seasonalEventFactor = 3.2;
            else if (product.name === 'Fairy Wings') seasonalEventFactor = 2.8;
            else if (product.name === 'Ghost Pepper') seasonalEventFactor = 2.5;
            else if (product.name === 'Disguise Potion') seasonalEventFactor = 2.7;
            else if (product.name === 'Bat Wings') seasonalEventFactor = 2.0;
            else if (product.name === 'Flying Potion') seasonalEventFactor = 2.2;
            else if (product.name === 'Vampire Blood') seasonalEventFactor = 2.2;
            else seasonalEventFactor = 1.8;
        }

        const effectiveMultiplier = Number((seasonalEventFactor * halloweenMultiplier).toFixed(2));

        // 6. Project 7-day, 14-day, 30-day future demand curves with 95% confidence intervals
        const futureProjections = [];
        let predicted7DayDemand = 0;
        let predicted14DayDemand = 0;
        let predicted30DayDemand = 0;

        const startDate = new Date('2026-11-01');

        for (let k = 1; k <= 30; k++) {
            const rawVal = selectedForecast30[k - 1] || meanDailyDemand;
            const adjustedVal = Math.max(0.2, Number((rawVal * effectiveMultiplier).toFixed(2)));

            // 95% confidence interval using standard deviation growth sqrt(k)
            const margin = Number((1.96 * stdDevDailyDemand * Math.sqrt(k / 7)).toFixed(2));
            const confLow = Math.max(0, Number((adjustedVal - margin).toFixed(2)));
            const confHigh = Number((adjustedVal + margin).toFixed(2));

            if (k <= 7) predicted7DayDemand += adjustedVal;
            if (k <= 14) predicted14DayDemand += adjustedVal;
            predicted30DayDemand += adjustedVal;

            const d = new Date(startDate);
            d.setDate(startDate.getDate() + (k - 1));
            const dateStr = d.toISOString().split('T')[0];

            futureProjections.push({
                day: k,
                date: dateStr,
                predicted: adjustedVal,
                conf_low: confLow,
                conf_high: confHigh,
                model_base: rawVal
            });
        }

        predicted7DayDemand = Math.round(predicted7DayDemand);
        predicted14DayDemand = Math.round(predicted14DayDemand);
        predicted30DayDemand = Math.round(predicted30DayDemand);

        // 7. Inventory Stockout Risk & Depletion Countdown
        const avgProjectedDaily = predicted30DayDemand / 30;
        const daysUntilStockout = avgProjectedDaily > 0 
            ? Number((product.current_stock / avgProjectedDaily).toFixed(1))
            : 999;

        let stockStatus = 'HEALTHY';
        let stockoutRiskCategory = 'LOW';

        if (product.current_stock <= 0) {
            stockStatus = 'OUT_OF_STOCK';
            stockoutRiskCategory = 'CRITICAL';
        } else if (daysUntilStockout <= 3) {
            stockStatus = 'CRITICAL';
            stockoutRiskCategory = 'CRITICAL';
        } else if (daysUntilStockout <= 7) {
            stockStatus = 'LOW_STOCK';
            stockoutRiskCategory = 'HIGH';
        } else if (daysUntilStockout <= 14) {
            stockStatus = 'LOW_STOCK';
            stockoutRiskCategory = 'MODERATE';
        } else if (daysUntilStockout > 60 && product.current_stock > (product.max_stock_level || 50)) {
            stockStatus = 'OVERSTOCKED';
            stockoutRiskCategory = 'LOW';
        }

        // Reorder point & suggested reorder units calculation
        const leadTime = product.lead_time_days || 3;
        const leadTimeDemand = avgProjectedDaily * leadTime;
        const safetyStock = Number((1.65 * stdDevDailyDemand * Math.sqrt(leadTime)).toFixed(0)); // 95% service level
        const reorderPoint = Math.ceil(leadTimeDemand + safetyStock);
        const suggestedReorderQty = Math.max(0, Math.ceil(reorderPoint - product.current_stock + leadTimeDemand));

        // 8. Plain-Language Explanation for Madam Hex (Section 2 Requirement)
        let plainExplanation = '';
        if (stockStatus === 'OUT_OF_STOCK') {
            plainExplanation = `Madam Hex, ${product.name} is completely out of stock! Shelves are depleted and incoming demand of ${predicted7DayDemand} units over the next 7 days will be lost without an immediate purchase order.`;
        } else if (stockStatus === 'CRITICAL' || daysUntilStockout <= 3) {
            plainExplanation = `Madam Hex, ${product.name} may run out before Halloween! Available stock (${product.current_stock} units) will deplete in only ${daysUntilStockout} days, while predicted 14-day demand reaches ${predicted14DayDemand} units. Reorder ${suggestedReorderQty} units immediately.`;
        } else if (stockStatus === 'LOW_STOCK') {
            plainExplanation = `Madam Hex, stock of ${product.name} (${product.current_stock} units) is below the safe Reorder Point (${reorderPoint} units). Reorder ${suggestedReorderQty} units to prevent midnight stockouts.`;
        } else if (stockStatus === 'OVERSTOCKED') {
            plainExplanation = `Madam Hex, ${product.name} is overstocked with ${product.current_stock} units on hand against monthly projected demand of ${predicted30DayDemand} units. We recommend halting purchase orders to liberate capital.`;
        } else {
            plainExplanation = `Madam Hex, ${product.name} inventory is in perfect balance. Available stock of ${product.current_stock} units comfortably covers the next ${daysUntilStockout} days of customer demand.`;
        }

        const bestEvaluation = backtest.evaluations.find(e => e.modelName === activeModelName) || backtest.evaluations[0];

        return {
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            item_type: product.item_type,
            category_name: product.category_name,
            current_stock: product.current_stock,
            unit_cost: Number(product.unit_cost || 0),
            selling_price: Number(product.selling_price || 0),
            supplier_id: product.supplier_id || null,
            supplier_name: product.supplier_name || 'Hallowmere Merchant',
            lead_time_days: leadTime,
            is_halloween_surge: Boolean(product.is_halloween_surge),
            metrics: {
                mean_daily_demand: meanDailyDemand,
                std_dev_daily_demand: stdDevDailyDemand,
                lead_time_days: leadTime,
                safety_stock: safetyStock,
                reorder_point: reorderPoint,
                seasonal_factor: seasonalEventFactor,
                effective_multiplier: effectiveMultiplier,
                is_simulated_multiplier: halloweenMultiplier !== 1.0
            },
            model_info: {
                active_model_name: activeModelName,
                requested_model: requestedModel,
                accuracy_metrics: {
                    mae: bestEvaluation.mae,
                    wape: `${bestEvaluation.wape}%`,
                    bias: `${bestEvaluation.bias > 0 ? '+' : ''}${bestEvaluation.bias}%`,
                    relative_accuracy: `${bestEvaluation.relativeAccuracyPct}%`
                },
                backtest_period: 'Last 14 days chronological holdout'
            },
            predictions: {
                predicted_7d_demand: predicted7DayDemand,
                predicted_14d_demand: predicted14DayDemand,
                predicted_30d_demand: predicted30DayDemand,
                days_until_stockout: daysUntilStockout,
                stock_status: stockStatus,
                stockout_risk_category: stockoutRiskCategory,
                suggested_reorder_qty: suggestedReorderQty,
                plain_explanation: plainExplanation
            },
            curves: {
                historical_sales: continuousSeries.slice(-30),
                future_projections: futureProjections,
                all_model_projections: {
                    naive: naive30,
                    moving_average: sma30,
                    holt_linear: holtLinear30,
                    holt_winters: holtWinters30
                }
            },
            backtest_evaluations: backtest.evaluations
        };
    }

    /**
     * Compute forecasts across all products
     */
    static forecastAll(options = {}) {
        const products = ProductModel.getAll({ includeArchived: false });
        return products.map(p => this.forecastProduct(p.id, options));
    }

    /**
     * Get aggregate model backtesting evaluation benchmark across entire catalog
     */
    static getModelEvaluationLeaderboard() {
        const products = ProductModel.getAll({ includeArchived: false });
        const modelStats = {
            'Seasonal Naive Baseline': { name: 'Seasonal Naive Baseline', totalMAE: 0, totalWAPE: 0, winCount: 0, count: 0 },
            '7-Day Moving Average': { name: '7-Day Moving Average', totalMAE: 0, totalWAPE: 0, winCount: 0, count: 0 },
            'Holts Linear Trend': { name: 'Holts Linear Trend', totalMAE: 0, totalWAPE: 0, winCount: 0, count: 0 },
            'Holt-Winters Additive': { name: 'Holt-Winters Additive', totalMAE: 0, totalWAPE: 0, winCount: 0, count: 0 }
        };

        const perProductEvaluations = [];

        for (const p of products) {
            const bt = this.backtestProduct(p.id, 14);
            perProductEvaluations.push({
                productId: p.id,
                productName: p.name,
                bestModel: bt.bestModel,
                evaluations: bt.evaluations
            });

            for (const ev of bt.evaluations) {
                if (modelStats[ev.modelName]) {
                    modelStats[ev.modelName].totalMAE += ev.mae;
                    modelStats[ev.modelName].totalWAPE += ev.wape;
                    modelStats[ev.modelName].count++;
                    if (ev.isBest) modelStats[ev.modelName].winCount++;
                }
            }
        }

        const summaryLeaderboard = Object.values(modelStats).map(m => ({
            modelName: m.name,
            averageMAE: Number((m.totalMAE / (m.count || 1)).toFixed(2)),
            averageWAPE: `${Number((m.totalWAPE / (m.count || 1)).toFixed(1))}%`,
            productsWon: m.winCount,
            winRatePct: `${Number(((m.winCount / products.length) * 100).toFixed(1))}%`
        })).sort((a, b) => a.averageMAE - b.averageMAE);

        return {
            catalogProductCount: products.length,
            holdoutWindowDays: 14,
            summaryLeaderboard,
            perProductEvaluations
        };
    }
}

module.exports = ForecastingService;
