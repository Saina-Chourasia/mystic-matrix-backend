const { getDb } = require('../config/db');

class DatasetModel {
    getSources() {
        const db = getDb();
        return db.prepare('SELECT * FROM dataset_sources ORDER BY id ASC').all();
    }

    getSourceByKey(key) {
        const db = getDb();
        return db.prepare('SELECT * FROM dataset_sources WHERE key = ?').get(key);
    }

    recordImportStart({ datasetKey, filePath, fileSizeBytes, sha256Hash }) {
        const db = getDb();
        const res = db.prepare(`
            INSERT INTO dataset_imports (dataset_key, file_path, file_size_bytes, sha256_hash, status, started_at)
            VALUES (?, ?, ?, ?, 'PROCESSING', CURRENT_TIMESTAMP)
        `).run(datasetKey, filePath, fileSizeBytes, sha256Hash || null);
        return res.lastInsertRowid;
    }

    recordImportComplete(importId, stats) {
        const db = getDb();
        db.prepare(`
            UPDATE dataset_imports 
            SET status = 'COMPLETED',
                total_rows_read = ?,
                valid_sales_rows = ?,
                cancellation_rows = ?,
                skipped_rows = ?,
                unique_products_count = ?,
                unique_customers_count = ?,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            stats.totalRows || 0,
            stats.validSales || 0,
            stats.cancellations || 0,
            stats.skipped || 0,
            stats.uniqueProducts || 0,
            stats.uniqueCustomers || 0,
            importId
        );

        // Update dataset_sources record_count
        const imp = db.prepare('SELECT dataset_key FROM dataset_imports WHERE id = ?').get(importId);
        if (imp) {
            db.prepare(`
                UPDATE dataset_sources 
                SET record_count = (SELECT COUNT(*) FROM imported_retail_transactions)
                WHERE key = ?
            `).run(imp.dataset_key);
        }
    }

    recordImportFailed(importId, errorMessage) {
        const db = getDb();
        db.prepare(`
            UPDATE dataset_imports 
            SET status = 'FAILED', error_message = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(errorMessage, importId);
    }

    getImports(limit = 20, offset = 0) {
        const db = getDb();
        return db.prepare(`
            SELECT di.*, ds.name as dataset_name, ds.category, ds.attribution
            FROM dataset_imports di
            JOIN dataset_sources ds ON ds.key = di.dataset_key
            ORDER BY di.started_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);
    }

    insertRetailBatch(importId, rows) {
        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO imported_retail_transactions 
            (import_id, invoice_no, stock_code, description, quantity, invoice_date, invoice_day, unit_price, customer_id, country, is_cancellation, total_amount, is_validation_split)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        db.exec('BEGIN TRANSACTION;');
        try {
            for (const r of rows) {
                stmt.run(
                    importId,
                    r.invoiceNo,
                    r.stockCode,
                    r.description || '',
                    r.quantity,
                    r.invoiceDate,
                    r.invoiceDay,
                    r.unitPrice,
                    r.customerId || null,
                    r.country || 'United Kingdom',
                    r.isCancellation ? 1 : 0,
                    r.totalAmount,
                    r.isValidationSplit ? 1 : 0
                );
            }
            db.exec('COMMIT;');
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }
    }

    upsertDailyDemandBatch(rows) {
        const db = getDb();
        const stmt = db.prepare(`
            INSERT INTO imported_daily_demand (stock_code, description, demand_date, units_sold, units_cancelled, net_units, revenue, transaction_count, split_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(stock_code, demand_date) DO UPDATE SET
                units_sold = units_sold + excluded.units_sold,
                units_cancelled = units_cancelled + excluded.units_cancelled,
                net_units = net_units + excluded.net_units,
                revenue = revenue + excluded.revenue,
                transaction_count = transaction_count + excluded.transaction_count
        `);

        db.exec('BEGIN TRANSACTION;');
        try {
            for (const r of rows) {
                stmt.run(
                    r.stockCode,
                    r.description || '',
                    r.demandDate,
                    r.unitsSold || 0,
                    r.unitsCancelled || 0,
                    r.netUnits || 0,
                    r.revenue || 0.0,
                    r.transactionCount || 1,
                    r.splitType || 'TRAIN'
                );
            }
            db.exec('COMMIT;');
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }
    }

    getRetailTransactions({ limit = 50, offset = 0, stockCode = null, isCancellation = null, splitType = null }) {
        const db = getDb();
        const conditions = [];
        const params = [];

        if (stockCode) {
            conditions.push('stock_code = ?');
            params.push(stockCode);
        }
        if (isCancellation !== null && isCancellation !== undefined) {
            conditions.push('is_cancellation = ?');
            params.push(isCancellation ? 1 : 0);
        }
        if (splitType === 'VALIDATION') {
            conditions.push('is_validation_split = 1');
        } else if (splitType === 'TRAIN') {
            conditions.push('is_validation_split = 0');
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countQuery = `SELECT COUNT(*) as total FROM imported_retail_transactions ${whereClause}`;
        const total = db.prepare(countQuery).get(...params).total;

        const dataQuery = `
            SELECT id, invoice_no, stock_code, description, quantity, invoice_date, invoice_day,
                   unit_price, 
                   CASE 
                     WHEN customer_id IS NOT NULL THEN 'CUST-' || substr(customer_id, 1, 2) || '***'
                     ELSE 'GUEST'
                   END as masked_customer_id,
                   country, is_cancellation, total_amount, is_validation_split, created_at
            FROM imported_retail_transactions
            ${whereClause}
            ORDER BY invoice_date DESC
            LIMIT ? OFFSET ?
        `;

        const rows = db.prepare(dataQuery).all(...params, limit, offset);

        return {
            total,
            limit,
            offset,
            transactions: rows
        };
    }

    getDailyDemandSummary({ limit = 30, stockCode = null, splitType = null }) {
        const db = getDb();
        const conditions = [];
        const params = [];

        if (stockCode) {
            conditions.push('stock_code = ?');
            params.push(stockCode);
        }
        if (splitType) {
            conditions.push('split_type = ?');
            params.push(splitType);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const rows = db.prepare(`
            SELECT stock_code, description, demand_date, units_sold, units_cancelled, net_units, revenue, transaction_count, split_type
            FROM imported_daily_demand
            ${whereClause}
            ORDER BY demand_date DESC
            LIMIT ?
        `).all(...params, limit);

        const totals = db.prepare(`
            SELECT 
                COUNT(DISTINCT stock_code) as distinct_products,
                SUM(units_sold) as total_units_sold,
                SUM(units_cancelled) as total_units_cancelled,
                SUM(net_units) as total_net_units,
                ROUND(SUM(revenue), 2) as total_revenue,
                MIN(demand_date) as earliest_date,
                MAX(demand_date) as latest_date
            FROM imported_daily_demand
            ${whereClause}
        `).get(...params);

        return {
            totals,
            demand: rows
        };
    }

    getTopRetailProducts(limit = 10) {
        const db = getDb();
        return db.prepare(`
            SELECT stock_code, description, 
                   SUM(units_sold) as total_units_sold,
                   SUM(units_cancelled) as total_units_cancelled,
                   SUM(net_units) as net_demand,
                   ROUND(SUM(revenue), 2) as total_revenue,
                   COUNT(DISTINCT demand_date) as active_days
            FROM imported_daily_demand
            GROUP BY stock_code
            ORDER BY total_revenue DESC
            LIMIT ?
        `).all(limit);
    }
}

module.exports = new DatasetModel();

