-- ═══════════════════════════════════════════════════════════════════════
-- MYSTIC MATRIX: Migration 003 - Authentication, Customer Portals,
-- Shared Orders & UCI Real Retail Dataset Pipeline
-- ═══════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- 1. Users Table (Both ADMIN and USER accounts)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN', 'USER')),
    name TEXT NOT NULL,
    avatar_url TEXT,
    phone TEXT,
    preferences TEXT DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Server-Side Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Password Reset Tokens (Single-Use with Expiry)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Shopping Carts Table
CREATE TABLE IF NOT EXISTS carts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Shopping Cart Items Table
CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cart_id, product_id)
);

-- 6. Store Orders Table (Authoritative Order Ledger)
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'REFUNDED')),
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL DEFAULT 0.0,
    shipping_amount REAL NOT NULL DEFAULT 0.0,
    total_amount REAL NOT NULL,
    shipping_address TEXT,
    notes TEXT,
    payment_method TEXT DEFAULT 'DEMO_SPELL_GOLD',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    total_price REAL NOT NULL CHECK(total_price >= 0),
    product_name TEXT NOT NULL,
    product_sku TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Security Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Dataset Sources Metadata Table
CREATE TABLE IF NOT EXISTS dataset_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('DEMO DATA', 'REAL DATA')),
    description TEXT NOT NULL,
    attribution TEXT NOT NULL,
    source_url TEXT NOT NULL,
    record_count INTEGER DEFAULT 0,
    date_range_start TEXT,
    date_range_end TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Dataset Imports Tracking Table
CREATE TABLE IF NOT EXISTS dataset_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_key TEXT NOT NULL REFERENCES dataset_sources(key),
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    sha256_hash TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    total_rows_read INTEGER DEFAULT 0,
    valid_sales_rows INTEGER DEFAULT 0,
    cancellation_rows INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    unique_products_count INTEGER DEFAULT 0,
    unique_customers_count INTEGER DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    error_message TEXT
);

-- 11. Imported Real Retail Transactions (UCI Online Retail II)
CREATE TABLE IF NOT EXISTS imported_retail_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL REFERENCES dataset_imports(id) ON DELETE CASCADE,
    invoice_no TEXT NOT NULL,
    stock_code TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    invoice_date TEXT NOT NULL,
    invoice_day TEXT NOT NULL,
    unit_price REAL NOT NULL,
    customer_id TEXT,
    country TEXT NOT NULL,
    is_cancellation BOOLEAN NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL,
    is_validation_split BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. Aggregated Daily Retail Demand (Optimized Analytical / Forecasting Table)
CREATE TABLE IF NOT EXISTS imported_daily_demand (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT NOT NULL,
    description TEXT,
    demand_date TEXT NOT NULL,
    units_sold INTEGER NOT NULL DEFAULT 0,
    units_cancelled INTEGER NOT NULL DEFAULT 0,
    net_units INTEGER NOT NULL DEFAULT 0,
    revenue REAL NOT NULL DEFAULT 0.0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    split_type TEXT NOT NULL DEFAULT 'TRAIN' CHECK(split_type IN ('TRAIN', 'VALIDATION')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_code, demand_date)
);

-- Indexes for Speed & Scalability
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_retail_stock_date ON imported_retail_transactions(stock_code, invoice_day);
CREATE INDEX IF NOT EXISTS idx_retail_cancellation ON imported_retail_transactions(is_cancellation);
CREATE INDEX IF NOT EXISTS idx_retail_split ON imported_retail_transactions(is_validation_split);
CREATE INDEX IF NOT EXISTS idx_demand_stock_date ON imported_daily_demand(stock_code, demand_date);
CREATE INDEX IF NOT EXISTS idx_demand_split ON imported_daily_demand(split_type);

