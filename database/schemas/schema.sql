-- MYSTIC MATRIX Database Schema
-- SQLite Relational Schema for Madam Hex's Magical Emporium

PRAGMA foreign_keys = ON;

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Suppliers Table (Magical Realms & Guilds)
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    realm TEXT NOT NULL,
    lead_time_days INTEGER NOT NULL DEFAULT 3,
    contact TEXT,
    reliability_score REAL NOT NULL DEFAULT 0.95,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    description TEXT,
    image_url TEXT,
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 10,
    max_stock_level INTEGER NOT NULL DEFAULT 100,
    unit_cost REAL NOT NULL DEFAULT 5.0,
    selling_price REAL NOT NULL DEFAULT 12.0,
    reorder_point INTEGER NOT NULL DEFAULT 15,
    safety_stock INTEGER NOT NULL DEFAULT 8,
    is_halloween_surge BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);

-- 4. Sales Table (Historical transactions)
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_amount REAL NOT NULL,
    sale_date TEXT NOT NULL, -- ISO date YYYY-MM-DD
    customer_type TEXT DEFAULT 'Witch', -- Witch, Wizard, Warlock, Necromancer, Alchemist, Fairy
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 5. Inventory Transactions Table (Audit trail for restocks, adjustments, usage)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- RESTOCK, SALE, WASTE, ADJUSTMENT, SPELL_FAILURE
    quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 6. Forecasts Table (Computed predictions & intelligence metrics)
CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    forecast_date TEXT NOT NULL, -- YYYY-MM-DD
    horizon_days INTEGER NOT NULL, -- 7 or 30
    predicted_demand REAL NOT NULL,
    confidence_lower REAL NOT NULL,
    confidence_upper REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'Holt-Winters Exponential Smoothing',
    seasonal_factor REAL NOT NULL DEFAULT 1.0,
    suggested_reorder INTEGER NOT NULL DEFAULT 0,
    stockout_risk_days INTEGER NOT NULL DEFAULT 999,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_date ON sales(product_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_product ON forecasts(product_id, horizon_days);

