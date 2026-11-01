const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../hexventory.db');
const SQL_PATH = path.resolve(__dirname, '002_part2_features.sql');

function runMigration() {
    console.log('🔮 Running Part 2 Migration on:', DB_PATH);
    const db = new DatabaseSync(DB_PATH);

    db.exec('PRAGMA foreign_keys = ON;');

    // 1. Safely add columns to products table if missing
    const productCols = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
    if (!productCols.includes('sku')) {
        console.log('  Adding sku column to products...');
        db.exec('ALTER TABLE products ADD COLUMN sku TEXT;');
    }
    if (!productCols.includes('item_type')) {
        console.log('  Adding item_type column to products...');
        db.exec("ALTER TABLE products ADD COLUMN item_type TEXT DEFAULT 'ingredient';");
    }
    if (!productCols.includes('is_archived')) {
        console.log('  Adding is_archived column to products...');
        db.exec('ALTER TABLE products ADD COLUMN is_archived BOOLEAN DEFAULT 0;');
    }

    // 2. Safely add columns to suppliers table if missing
    const supplierCols = db.prepare('PRAGMA table_info(suppliers)').all().map(c => c.name);
    if (!supplierCols.includes('moq')) {
        console.log('  Adding moq column to suppliers...');
        db.exec('ALTER TABLE suppliers ADD COLUMN moq INTEGER DEFAULT 10;');
    }
    if (!supplierCols.includes('notes')) {
        console.log('  Adding notes column to suppliers...');
        db.exec('ALTER TABLE suppliers ADD COLUMN notes TEXT;');
    }

    // 3. Run table creation SQL
    const sql = fs.readFileSync(SQL_PATH, 'utf-8');
    db.exec(sql);
    console.log('✔ Part 2 Tables & Indexes created successfully.');

    // 4. Populate SKU & item_type for all 22 canonical products
    const products = db.prepare('SELECT id, name, category_id, sku FROM products ORDER BY id ASC').all();
    let ingCount = 1;
    let potCount = 1;
    const updateProductStmt = db.prepare('UPDATE products SET sku = ?, item_type = ? WHERE id = ?');

    for (const p of products) {
        const isPotion = p.category_id === 2 || p.name.toLowerCase().includes('potion') || p.name.toLowerCase().includes('serum');
        const itemType = isPotion ? 'potion' : 'ingredient';
        const generatedSku = isPotion 
            ? `HEX-POT-${String(potCount++).padStart(3, '0')}`
            : `HEX-ING-${String(ingCount++).padStart(3, '0')}`;
        
        const skuToSet = p.sku || generatedSku;
        updateProductStmt.run(skuToSet, itemType, p.id);
    }
    console.log('✔ Updated SKUs and item_types across all 22 products.');

    // 5. Seed Canonical Potion Recipes (Section 3 Requirement)
    const productByName = (name) => db.prepare('SELECT id FROM products WHERE name = ?').get(name)?.id;

    const lovePotionId = productByName('Love Potion');
    const flyingPotionId = productByName('Flying Potion');
    const invisibilityPotionId = productByName('Invisibility Potion');
    const healingPotionId = productByName('Healing Potion');
    const truthSerumId = productByName('Truth Serum');
    const beautyPotionId = productByName('Beauty Potion');

    const stardustId = productByName('Stardust');
    const fairyWingsId = productByName('Fairy Wings');
    const moonDustId = productByName('Moon Dust');
    const phoenixFeathersId = productByName('Phoenix Feathers');
    const dragonScalesId = productByName('Dragon Scales');
    const crystalShardsId = productByName('Crystal Shards');
    const unicornHairId = productByName('Unicorn Hair');
    const witchHazelId = productByName('Witch Hazel');
    const mandrakeRootsId = productByName('Mandrake Roots');
    const vampireBloodId = productByName('Vampire Blood');

    const recipesToSeed = [
        {
            potionId: lovePotionId,
            name: 'Roseate Amour Draught (Love Potion)',
            description: 'Intoxicating enchantment potion infusing passionate adoration and heartfelt empathy.',
            brewingTime: 1.5,
            difficulty: 'Apprentice',
            instructions: 'Simmer Stardust until bubbling violet. Stir in powdered Fairy Wings counter-clockwise, then bind with luminous Moon Dust under crescent moon.',
            ingredients: [
                { id: stardustId, qty: 2 },
                { id: fairyWingsId, qty: 1 },
                { id: moonDustId, qty: 1 }
            ]
        },
        {
            potionId: flyingPotionId,
            name: 'Zephyr Aerial Elixir (Flying Potion)',
            description: 'Sky-blue buoyant draught granting effortless levitation and supersonic broomstick flight.',
            brewingTime: 2.5,
            difficulty: 'Adept',
            instructions: 'Infuse freshly gathered Fairy Wings into boiling spring water. Add powdered Phoenix Feathers to produce thermal lift, and seal with molten Dragon Scale.',
            ingredients: [
                { id: fairyWingsId, qty: 3 },
                { id: phoenixFeathersId, qty: 2 },
                { id: dragonScalesId, qty: 1 }
            ]
        },
        {
            potionId: invisibilityPotionId,
            name: 'Phantom Veil Phial (Invisibility Potion)',
            description: 'Translucent chromatic mist potion providing absolute optical refraction from mortal and magical eyes.',
            brewingTime: 3.0,
            difficulty: 'Master',
            instructions: 'Crush Crystal Shards into microscopic prismatic dust. Weave single strand of Unicorn Hair through cold Moon Dust solution until completely clear.',
            ingredients: [
                { id: crystalShardsId, qty: 2 },
                { id: unicornHairId, qty: 1 },
                { id: moonDustId, qty: 2 }
            ]
        },
        {
            potionId: healingPotionId,
            name: 'Elysian Vitality Tonic (Healing Potion)',
            description: 'Emerald restorative elixir that mends spell burns, cursed wounds, and fractured bones instantly.',
            brewingTime: 1.0,
            difficulty: 'Novice',
            instructions: 'Decoct Witch Hazel bark in heated copper kettle. Grind Mandrake Root to paste, then stabilize with two drops of Vampire Blood.',
            ingredients: [
                { id: witchHazelId, qty: 2 },
                { id: mandrakeRootsId, qty: 1 },
                { id: vampireBloodId, qty: 1 }
            ]
        },
        {
            potionId: truthSerumId,
            name: 'Veritas Clear Draught (Truth Serum)',
            description: 'Completely tasteless, colorless serum compelling complete honesty and unmasking illusions.',
            brewingTime: 2.0,
            difficulty: 'Adept',
            instructions: 'Distill Moon Dust under midnight zenith. Filter through Crystal Shards three times, then activate with crushed Fairy Wings.',
            ingredients: [
                { id: moonDustId, qty: 2 },
                { id: crystalShardsId, qty: 1 },
                { id: fairyWingsId, qty: 1 }
            ]
        },
        {
            potionId: beautyPotionId,
            name: 'Aphrodite Luminous Glamour (Beauty Potion)',
            description: 'Golden glowing draught that bestows hypnotic allure, radiant complexion, and starlit charisma.',
            brewingTime: 1.2,
            difficulty: 'Apprentice',
            instructions: 'Whisk Stardust into warm almond oil. Dissolve whole Fairy Wings and bind with powdered Unicorn Hair.',
            ingredients: [
                { id: stardustId, qty: 1 },
                { id: fairyWingsId, qty: 1 },
                { id: unicornHairId, qty: 1 }
            ]
        }
    ];

    const insertRecipeStmt = db.prepare(`
        INSERT INTO recipes (potion_product_id, name, description, brewing_time_hours, difficulty, instructions)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertRecipeIngStmt = db.prepare(`
        INSERT INTO recipe_ingredients (recipe_id, ingredient_product_id, quantity_required)
        VALUES (?, ?, ?)
    `);

    for (const r of recipesToSeed) {
        if (!r.potionId) continue;
        const existing = db.prepare('SELECT id FROM recipes WHERE potion_product_id = ?').get(r.potionId);
        let recipeId;
        if (!existing) {
            const res = insertRecipeStmt.run(r.potionId, r.name, r.description, r.brewingTime, r.difficulty, r.instructions);
            recipeId = res.lastInsertRowid;
            console.log(`  Created recipe: ${r.name} (ID: ${recipeId})`);
        } else {
            recipeId = existing.id;
        }

        for (const ing of r.ingredients) {
            if (!ing.id) continue;
            try {
                insertRecipeIngStmt.run(recipeId, ing.id, ing.qty);
            } catch (e) {
                // Ignore unique constraint if already exists
            }
        }
    }
    console.log('✔ Canonical Potion Recipes & Ingredients seeded.');

    // 6. Seed Supplier Products & Sample Purchase Orders
    const suppliers = db.prepare('SELECT id, name, lead_time_days FROM suppliers').all();
    const insertSupplierProdStmt = db.prepare(`
        INSERT OR IGNORE INTO supplier_products (supplier_id, product_id, purchase_price, lead_time_days, minimum_order_qty, is_preferred)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const s of suppliers) {
        for (const p of products) {
            // Supplier specializes in certain ingredients or potions
            const purchasePrice = Number((p.unit_cost || 10).toFixed(2));
            const leadTime = s.lead_time_days || 3;
            const isPref = (s.id === 1 && p.id <= 6) || (s.id === 2 && p.id > 6 && p.id <= 12) || (s.id === 3 && p.id > 12);
            insertSupplierProdStmt.run(s.id, p.id, purchasePrice, leadTime, 10, isPref ? 1 : 0);
        }
    }
    console.log('✔ Supplier product matrices configured.');

    // Seed 1 active Purchase Order in 'IN_TRANSIT' and 1 'RECEIVED' for historical audit
    const existingPOs = db.prepare('SELECT COUNT(*) as count FROM purchase_orders').get().count;
    if (existingPOs === 0) {
        const po1 = db.prepare(`
            INSERT INTO purchase_orders (po_number, supplier_id, status, total_amount, expected_delivery_date, submitted_at, notes)
            VALUES (?, ?, ?, ?, ?, datetime('now', '-1 day'), ?)
        `).run('PO-2026-OCT-001', 1, 'IN_TRANSIT', 650.0, '2026-11-02', 'Urgent Halloween Reagent Replenishment (Fairy Wings & Ghost Pepper)');

        const po1Id = po1.lastInsertRowid;
        if (fairyWingsId) {
            db.prepare(`
                INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost, total_cost)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(po1Id, fairyWingsId, 25, 0, 14.0, 350.0);
        }
        if (dragonScalesId) {
            db.prepare(`
                INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost, total_cost)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(po1Id, dragonScalesId, 10, 0, 30.0, 300.0);
        }
        console.log('✔ Seeded initial demonstration Purchase Order PO-2026-OCT-001.');
    }

    console.log('\n🎉 STAGE 1 & 2 MIGRATION COMPLETED SUCCESSFULLY!');
}

runMigration();

