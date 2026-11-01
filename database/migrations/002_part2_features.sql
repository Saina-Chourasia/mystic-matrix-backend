-- ═══════════════════════════════════════════════════════════════
-- MYSTIC MATRIX: Migration 002 - Advanced Technical Features
-- ═══════════════════════════════════════════════════════════════

-- 1. Extend products table with SKU, item_type, is_archived (if not exists)
-- (Handled in JS runner for safe SQLite column additions)

-- 2. Potion Recipes Table
CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    potion_product_id INTEGER NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    description TEXT,
    brewing_time_hours REAL DEFAULT 2.0,
    difficulty TEXT DEFAULT 'Apprentice' CHECK(difficulty IN ('Novice', 'Apprentice', 'Adept', 'Master')),
    yield_quantity INTEGER DEFAULT 1,
    instructions TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Recipe Ingredients Table
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_product_id INTEGER NOT NULL REFERENCES products(id),
    quantity_required INTEGER NOT NULL CHECK(quantity_required > 0),
    unit TEXT DEFAULT 'units',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(recipe_id, ingredient_product_id)
);

-- 4. Potion Production Batches Table
CREATE TABLE IF NOT EXISTS production_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_number TEXT UNIQUE NOT NULL,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id),
    potion_product_id INTEGER NOT NULL REFERENCES products(id),
    quantity_produced INTEGER NOT NULL CHECK(quantity_produced > 0),
    total_cost REAL NOT NULL DEFAULT 0.0,
    brewed_by TEXT DEFAULT 'Madam Hex',
    status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('BREWING', 'COMPLETED', 'FAILED')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Supplier Products Matrix Table
CREATE TABLE IF NOT EXISTS supplier_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    purchase_price REAL NOT NULL CHECK(purchase_price > 0),
    lead_time_days INTEGER NOT NULL CHECK(lead_time_days > 0),
    minimum_order_qty INTEGER DEFAULT 10 CHECK(minimum_order_qty > 0),
    is_preferred BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supplier_id, product_id)
);

-- 6. Purchase Orders Table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SUBMITTED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
    total_amount REAL NOT NULL DEFAULT 0.0,
    expected_delivery_date TEXT,
    submitted_at DATETIME,
    received_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Purchase Order Items Table
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity_ordered INTEGER NOT NULL CHECK(quantity_ordered > 0),
    quantity_received INTEGER NOT NULL DEFAULT 0 CHECK(quantity_received >= 0),
    unit_cost REAL NOT NULL CHECK(unit_cost > 0),
    total_cost REAL NOT NULL CHECK(total_cost >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_order_id, product_id)
);

-- 8. Purchase Order Receipts Table
CREATE TABLE IF NOT EXISTS purchase_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Forecast Evaluations & Backtest Table
CREATE TABLE IF NOT EXISTS forecast_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    model_name TEXT NOT NULL,
    horizon_days INTEGER NOT NULL DEFAULT 30,
    mae REAL NOT NULL,
    wape REAL NOT NULL,
    bias REAL NOT NULL,
    relative_accuracy REAL NOT NULL,
    is_best_model BOOLEAN DEFAULT 0,
    backtest_period TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_recipes_potion ON recipes(potion_product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_recipe ON production_batches(recipe_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_forecast_eval_prod ON forecast_evaluations(product_id);

