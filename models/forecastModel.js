const { getDb } = require('../config/db');

class ForecastModel {
    static save({ product_id, forecast_date, horizon_days, predicted_demand, confidence_lower, confidence_upper, method, seasonal_factor, suggested_reorder, stockout_risk_days }) {
        const db = getDb();
        // Remove prior forecast for this product and horizon on this date
        db.prepare(`DELETE FROM forecasts WHERE product_id = ? AND horizon_days = ? AND forecast_date = ?`)
            .run(product_id, horizon_days, forecast_date);

        const stmt = db.prepare(`
            INSERT INTO forecasts (
                product_id, forecast_date, horizon_days, predicted_demand,
                confidence_lower, confidence_upper, method, seasonal_factor,
                suggested_reorder, stockout_risk_days
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            product_id, forecast_date, horizon_days, predicted_demand,
            confidence_lower, confidence_upper, method || 'Holt-Winters',
            seasonal_factor, suggested_reorder, stockout_risk_days
        );

        return db.prepare(`SELECT * FROM forecasts ORDER BY id DESC LIMIT 1`).get();
    }

    static getByProductId(productId, horizon = 30) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM forecasts 
            WHERE product_id = ? AND horizon_days = ? 
            ORDER BY created_at DESC LIMIT 1
        `).get(productId, horizon);
    }

    static getAllLatest(horizon = 30) {
        const db = getDb();
        return db.prepare(`
            SELECT f.*, p.name as product_name, p.current_stock
            FROM forecasts f
            JOIN products p ON f.product_id = p.id
            WHERE f.horizon_days = ?
            ORDER BY f.predicted_demand DESC
        `).all(horizon);
    }
}

module.exports = ForecastModel;

