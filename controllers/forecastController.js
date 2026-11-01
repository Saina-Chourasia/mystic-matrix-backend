const ForecastingService = require('../services/forecastingService');
const { getDb } = require('../config/db');
const datasetModel = require('../models/datasetModel');

class ForecastController {
    static getAll(req, res) {
        try {
            const { halloweenMultiplier, model, source = 'fictional_apothecary' } = req.query;

            if (source === 'uci_online_retail_ii') {
                // REAL DATASET FORECASTING (UCI Online Retail II)
                const db = getDb();
                const topItems = datasetModel.getTopRetailProducts(15);

                const realForecasts = topItems.map((item, idx) => {
                    const days = db.prepare(`
                        SELECT demand_date, net_units
                        FROM imported_daily_demand
                        WHERE stock_code = ?
                        ORDER BY demand_date DESC
                        LIMIT 30
                    `).all(item.stock_code);

                    const avgDemand = days.length > 0 
                        ? days.reduce((sum, d) => sum + d.net_units, 0) / days.length 
                        : (item.net_demand / Math.max(1, item.active_days));

                    const dailyPredicted = Math.max(1, Math.round(avgDemand));
                    const horizon7 = dailyPredicted * 7;
                    const horizon30 = dailyPredicted * 30;

                    return {
                        id: `UCI-${item.stock_code}`,
                        stock_code: item.stock_code,
                        name: item.description || `Retail Item ${item.stock_code}`,
                        dataset_source: 'uci_online_retail_ii',
                        dataset_category: 'REAL DATA',
                        attribution: "Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D",
                        current_stock: null, // Clearly unmanufactured per prompt instructions
                        supplier_lead_time_days: null, // Simulated only
                        historical_units_sold: item.total_units_sold,
                        historical_units_cancelled: item.total_units_cancelled,
                        net_historical_demand: item.net_demand,
                        total_historical_revenue_gbp: item.total_revenue,
                        active_recorded_days: item.active_days,
                        predicted_daily_demand: dailyPredicted,
                        demand_7d: horizon7,
                        demand_30d: horizon30,
                        confidence_lower_7d: Math.max(0, Math.round(horizon7 * 0.85)),
                        confidence_upper_7d: Math.round(horizon7 * 1.15),
                        confidence_lower_30d: Math.max(0, Math.round(horizon30 * 0.80)),
                        confidence_upper_30d: Math.round(horizon30 * 1.20),
                        best_model: 'Holt-Winters Real Retail Moving Average',
                        recommended_reorder_qty: Math.round(horizon30 * 1.1),
                        stockout_risk_days: null, // Not manufactured
                        provenance: 'REAL_RETAIL_IMPORT'
                    };
                });

                return res.json({
                    success: true,
                    dataset: 'UCI Online Retail II (Real Dataset)',
                    category: 'REAL DATA',
                    attribution: "Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D",
                    count: realForecasts.length,
                    is_simulated: false,
                    data: realForecasts
                });
            }

            // DEFAULT: FICTIONAL APOTHECARY (DEMO DATA)
            const options = {
                halloweenMultiplier: halloweenMultiplier ? parseFloat(halloweenMultiplier) : 1.0,
                model: model || 'auto'
            };
            const forecasts = ForecastingService.forecastAll(options);

            const labeledForecasts = forecasts.map(f => ({
                ...f,
                dataset_source: 'fictional_apothecary',
                dataset_category: 'DEMO DATA',
                provenance: 'DEMO_POTION_SHOP'
            }));

            res.json({
                success: true,
                dataset: "Madam Hex's Potion Apothecary (Demo)",
                category: 'DEMO DATA',
                attribution: "Mystic Matrix Apothecary Lore (Fictional Demo Environment)",
                count: labeledForecasts.length,
                halloween_multiplier: options.halloweenMultiplier,
                is_simulated: options.halloweenMultiplier !== 1.0,
                data: labeledForecasts
            });
        } catch (error) {
            console.error('Forecast error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static getByProduct(req, res) {
        try {
            const { id } = req.params;
            const { halloweenMultiplier, model } = req.query;
            const options = {
                halloweenMultiplier: halloweenMultiplier ? parseFloat(halloweenMultiplier) : 1.0,
                model: model || 'auto'
            };
            const forecast = ForecastingService.forecastProduct(parseInt(id, 10), options);
            res.json({
                success: true,
                dataset_category: 'DEMO DATA',
                provenance: 'DEMO_POTION_SHOP',
                data: forecast
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static getEvaluations(req, res) {
        try {
            const { source = 'all' } = req.query;
            const db = getDb();

            const apothecaryLeaderboard = ForecastingService.getModelEvaluationLeaderboard();
            const realRetailEvaluations = db.prepare(`
                SELECT id, model_name, horizon_days, mae, wape, bias, relative_accuracy, is_best_model, backtest_period, created_at
                FROM forecast_evaluations
                ORDER BY created_at DESC
                LIMIT 10
            `).all();

            res.json({
                success: true,
                data: {
                    apothecaryDemo: apothecaryLeaderboard,
                    realRetailBacktest: realRetailEvaluations,
                    attribution: "Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D"
                }
            });
        } catch (error) {
            console.error('Model evaluation error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = ForecastController;
