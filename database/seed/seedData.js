/**
 * MYSTIC MATRIX Database Seeder
 * Populates Madam Hex's shop with 22 canonical magical products,
 * 5 suppliers, 90 days of realistic sales records with Halloween seasonality,
 * and initial inventory transaction logs.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.resolve(__dirname, '../hexventory.db');
const SCHEMA_PATH = path.resolve(__dirname, '../schemas/schema.sql');

function initDatabase() {
    console.log('🔮 Connecting to MYSTIC MATRIX SQLite Database at:', DB_PATH);
    const db = new DatabaseSync(DB_PATH);
    
    // Execute schema
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schemaSql);
    console.log('✨ Database schema initialized successfully.');
    return db;
}

function seedData(db) {
    console.log('🧹 Purging any old data for fresh magical seed...');
    db.exec(`
        PRAGMA foreign_keys = OFF;
        DELETE FROM forecasts;
        DELETE FROM inventory_transactions;
        DELETE FROM sales;
        DELETE FROM products;
        DELETE FROM suppliers;
        DELETE FROM categories;
        DELETE FROM sqlite_sequence;
        PRAGMA foreign_keys = ON;
    `);

    // 1. Categories
    console.log('📜 Seeding Categories...');
    const insertCategory = db.prepare(`
        INSERT INTO categories (name, slug, description, icon)
        VALUES (?, ?, ?, ?)
    `);

    insertCategory.run('Magical Ingredients', 'ingredients', 'Raw harvest reagents, mythical essences, and elemental components.', 'Sparkles');
    insertCategory.run('Magical Potions', 'potions', 'Brewed elixirs, distilled phials, and enchanted draughts.', 'FlaskConical');

    const catRows = db.prepare(`SELECT id, slug FROM categories`).all();
    const catMap = {};
    for (const c of catRows) { catMap[c.slug] = c.id; }

    // 2. Suppliers
    console.log('🏰 Seeding Suppliers...');
    const insertSupplier = db.prepare(`
        INSERT INTO suppliers (name, realm, lead_time_days, contact, reliability_score)
        VALUES (?, ?, ?, ?, ?)
    `);

    insertSupplier.run('Whispering Woods Foragers', 'Forbidden Forest, Glade 4', 3, 'foragers@whisperingwoods.realm', 0.96);
    insertSupplier.run('Phoenix Flame Sanctuary', 'Mount Cinder, Peak Sanctum', 5, 'caravans@phoenixflame.realm', 0.98);
    insertSupplier.run('Grimoire Hollow Guild', 'Hallowmere Nocturnal Market', 2, 'traders@grimoirehollow.realm', 0.92);
    insertSupplier.run('Astral Nebula Miners', 'Starlight Expanse, Orbit 9', 7, 'dispatch@astralnebula.realm', 0.88);
    insertSupplier.run('Shadowmire Alchemists', 'Swamp of Sorrows, Hut 13', 4, 'sales@shadowmire.realm', 0.94);

    const supRows = db.prepare(`SELECT id, name FROM suppliers`).all();
    const supMap = {};
    for (const s of supRows) { supMap[s.name] = s.id; }

    // 3. Products (22 Canonical Items)
    console.log('🧪 Seeding 22 Magical Products...');
    const insertProduct = db.prepare(`
        INSERT INTO products (
            name, category_id, supplier_id, description, image_url,
            current_stock, min_stock_level, max_stock_level, unit_cost, selling_price,
            reorder_point, safety_stock, is_halloween_surge
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 12 Ingredients (category_id = 1)
    const ingredients = [
        {
            name: 'Bat Wings',
            supplier_id: 3,
            desc: 'Cured nocturnal bat wings, essential for flight brews and eerie rituals.',
            image: '/images/bat-wings.svg',
            stock: 8, // Low stock!
            min: 15,
            max: 120,
            cost: 3.5,
            price: 9.0,
            rop: 22,
            safety: 10,
            surge: 1 // Halloween surge
        },
        {
            name: 'Ghost Pepper',
            supplier_id: 1,
            desc: 'Ethereal peppers harvested from haunted specter gardens. Extremely spicy and supernatural.',
            image: '/images/ghost-pepper.svg',
            stock: 5, // Critically low!
            min: 20,
            max: 100,
            cost: 6.0,
            price: 16.0,
            rop: 28,
            safety: 12,
            surge: 1 // Halloween surge
        },
        {
            name: 'Stardust',
            supplier_id: 4,
            desc: 'Glittering cosmic residue fallen from passing comets. Madam Hex bought way too much.',
            image: '/images/stardust.svg',
            stock: 145, // OVERSTOCKED!
            min: 20,
            max: 80,
            cost: 15.0,
            price: 32.0,
            rop: 25,
            safety: 10,
            surge: 0
        },
        {
            name: 'Fairy Wings',
            supplier_id: 1,
            desc: 'Cruelty-free shed gossamer fairy wings that shimmer in iridescent moonlight.',
            image: '/images/fairy-wings.svg',
            stock: 3, // CRITICAL STOCKOUT IMMINENT
            min: 25,
            max: 150,
            cost: 12.0,
            price: 28.0,
            rop: 35,
            safety: 15,
            surge: 1 // Huge Halloween surge
        },
        {
            name: 'Dragon Scales',
            supplier_id: 2,
            desc: 'Molted red drake scales impervious to physical flame and curse degradation.',
            image: '/images/dragon-scales.svg',
            stock: 45, // Healthy
            min: 15,
            max: 75,
            cost: 25.0,
            price: 58.0,
            rop: 20,
            safety: 8,
            surge: 0
        },
        {
            name: 'Phoenix Feathers',
            supplier_id: 2,
            desc: 'Warm, ever-glowing plumage with restorative properties.',
            image: '/images/phoenix-feathers.svg',
            stock: 18, // Healthy
            min: 10,
            max: 50,
            cost: 45.0,
            price: 110.0,
            rop: 14,
            safety: 6,
            surge: 0
        },
        {
            name: 'Unicorn Hair',
            supplier_id: 1,
            desc: 'Silken mane strands used for binding delicate enchantments.',
            image: '/images/unicorn-hair.svg',
            stock: 24, // Healthy
            min: 12,
            max: 60,
            cost: 30.0,
            price: 75.0,
            rop: 18,
            safety: 8,
            surge: 0
        },
        {
            name: 'Mandrake Roots',
            supplier_id: 5,
            desc: 'Screaming subterranean roots that awaken dormant magical currents.',
            image: '/images/mandrake-roots.svg',
            stock: 12, // Approaching low
            min: 15,
            max: 80,
            cost: 8.0,
            price: 22.0,
            rop: 20,
            safety: 9,
            surge: 1
        },
        {
            name: 'Moon Dust',
            supplier_id: 4,
            desc: 'Fine silver lunar particulates gathered during total lunar eclipses.',
            image: '/images/moon-dust.svg',
            stock: 32, // Healthy
            min: 15,
            max: 90,
            cost: 10.0,
            price: 25.0,
            rop: 22,
            safety: 10,
            surge: 0
        },
        {
            name: 'Vampire Blood',
            supplier_id: 3,
            desc: 'Fictional synthetic crimson essence fermented under black candles.',
            image: '/images/vampire-blood.svg',
            stock: 6, // Low stock!
            min: 15,
            max: 90,
            cost: 14.0,
            price: 36.0,
            rop: 24,
            safety: 10,
            surge: 1 // Halloween surge
        },
        {
            name: 'Witch Hazel',
            supplier_id: 1,
            desc: 'Aromatic golden bark extract for soothing mystical hex burns.',
            image: '/images/witch-hazel.svg',
            stock: 55, // Healthy
            min: 20,
            max: 100,
            cost: 4.0,
            price: 12.0,
            rop: 25,
            safety: 10,
            surge: 0
        },
        {
            name: 'Crystal Shards',
            supplier_id: 4,
            desc: 'Resonant quartz crystals tuned to amplify incantations.',
            image: '/images/crystal-shards.svg',
            stock: 78, // Slightly high
            min: 20,
            max: 80,
            cost: 5.0,
            price: 15.0,
            rop: 22,
            safety: 8,
            surge: 0
        }
    ];

    for (const item of ingredients) {
        insertProduct.run(
            item.name, 1, item.supplier_id, item.desc, item.image,
            item.stock, item.min, item.max, item.cost, item.price,
            item.rop, item.safety, item.surge
        );
    }

    // 10 Potions (category_id = 2)
    const potions = [
        {
            name: 'Love Potion',
            supplier_id: 3,
            desc: 'Roseate bubble elixir that induces charming infatuation and romantic warmth.',
            image: '/images/love-potion.svg',
            stock: 4, // CRITICAL LOW STOCK
            min: 20,
            max: 120,
            cost: 18.0,
            price: 48.0,
            rop: 32,
            safety: 14,
            surge: 1 // Massive Halloween surge
        },
        {
            name: 'Invisibility Potion',
            supplier_id: 5,
            desc: 'Translucent chromatic mist potion providing seamless stealth from mortal eyes.',
            image: '/images/invisibility-potion.svg',
            stock: 14, // Low
            min: 15,
            max: 70,
            cost: 28.0,
            price: 70.0,
            rop: 20,
            safety: 8,
            surge: 0
        },
        {
            name: 'Flying Potion',
            supplier_id: 3,
            desc: 'Sky-blue buoyant draught granting effortless aerial levitation.',
            image: '/images/flying-potion.svg',
            stock: 9, // Low stock
            min: 15,
            max: 80,
            cost: 22.0,
            price: 55.0,
            rop: 24,
            safety: 10,
            surge: 1 // Halloween broom rides
        },
        {
            name: 'Beauty Potion',
            supplier_id: 1,
            desc: 'Radiant glamour serum conferring mesmerizing countenance and glowing skin.',
            image: '/images/beauty-potion.svg',
            stock: 28, // Healthy
            min: 15,
            max: 80,
            cost: 16.0,
            price: 42.0,
            rop: 22,
            safety: 9,
            surge: 0
        },
        {
            name: 'Disguise Potion',
            supplier_id: 5,
            desc: 'Shapeshifting brew allowing temporary assumption of another magical persona.',
            image: '/images/disguise-potion.svg',
            stock: 7, // Low!
            min: 18,
            max: 90,
            cost: 20.0,
            price: 52.0,
            rop: 26,
            safety: 11,
            surge: 1 // Halloween costume craze
        },
        {
            name: 'Fame Potion',
            supplier_id: 4,
            desc: 'Golden effervescent liqueur that captivates audiences and turns heads.',
            image: '/images/fame-potion.svg',
            stock: 42, // Overstocked relative to demand
            min: 10,
            max: 50,
            cost: 32.0,
            price: 85.0,
            rop: 15,
            safety: 6,
            surge: 0
        },
        {
            name: 'Luck Potion',
            supplier_id: 2,
            desc: 'Liquid gold charm that bends probability in favor of the imbiber.',
            image: '/images/luck-potion.svg',
            stock: 16, // Healthy
            min: 10,
            max: 60,
            cost: 40.0,
            price: 115.0,
            rop: 16,
            safety: 7,
            surge: 0
        },
        {
            name: 'Memory Potion',
            supplier_id: 4,
            desc: 'Cobalt cerebral tincture unlocking buried memories and spell recitations.',
            image: '/images/memory-potion.svg',
            stock: 22, // Healthy
            min: 12,
            max: 60,
            cost: 20.0,
            price: 48.0,
            rop: 18,
            safety: 7,
            surge: 0
        },
        {
            name: 'Healing Potion',
            supplier_id: 1,
            desc: 'Emerald revitalizing tonic that restores vitality and soothes spell backlash.',
            image: '/images/healing-potion.svg',
            stock: 65, // Healthy high volume
            min: 25,
            max: 150,
            cost: 8.0,
            price: 24.0,
            rop: 35,
            safety: 15,
            surge: 0
        },
        {
            name: 'Truth Serum',
            supplier_id: 5,
            desc: 'Clear, tasteless drops that compel uncompromising honesty and transparency.',
            image: '/images/truth-serum.svg',
            stock: 11, // Low
            min: 15,
            max: 75,
            cost: 24.0,
            price: 62.0,
            rop: 20,
            safety: 8,
            surge: 1 // Halloween truth trials
        }
    ];

    for (const item of potions) {
        insertProduct.run(
            item.name, 2, item.supplier_id, item.desc, item.image,
            item.stock, item.min, item.max, item.cost, item.price,
            item.rop, item.safety, item.surge
        );
    }

    // 4. Sales History (90 Days of Sales with Halloween Seasonality)
    console.log('📈 Generating 90 days of realistic sales data (Aug 2 - Oct 31, 2026)...');
    const insertSale = db.prepare(`
        INSERT INTO sales (product_id, quantity, unit_price, total_amount, sale_date, customer_type, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const customerTypes = ['Witch', 'Wizard', 'Warlock', 'Necromancer', 'Alchemist', 'Fairy'];
    const products = db.prepare(`SELECT id, name, selling_price, is_halloween_surge FROM products`).all();

    const endDate = new Date('2026-10-31');
    let totalSalesCount = 0;

    for (let dayOffset = 90; dayOffset >= 0; dayOffset--) {
        const currentDate = new Date(endDate);
        currentDate.setDate(endDate.getDate() - dayOffset);
        const dateStr = currentDate.toISOString().split('T')[0];

        // Days closer to Halloween (late October) have high seasonal surge
        const daysToHalloween = dayOffset;
        let seasonalMultiplier = 1.0;
        if (daysToHalloween <= 14) {
            // Last 2 weeks of October: Halloween peak!
            seasonalMultiplier = 1.5 + (14 - daysToHalloween) * 0.15; // Up to 3.6x surge
        } else if (daysToHalloween <= 30) {
            seasonalMultiplier = 1.1 + (30 - daysToHalloween) * 0.02;
        }

        // Weekend boost (Friday / Saturday)
        const dayOfWeek = currentDate.getDay();
        const weekendMultiplier = (dayOfWeek === 5 || dayOfWeek === 6) ? 1.3 : 1.0;

        for (const prod of products) {
            // Base daily chance of a sale
            let baseChance = 0.55;
            let avgDailyQty = 2.0;

            if (prod.name === 'Healing Potion') {
                avgDailyQty = 4.5;
                baseChance = 0.85;
            } else if (prod.name === 'Stardust') {
                avgDailyQty = 0.8; // Slow mover! Overstocked
                baseChance = 0.35;
            } else if (prod.name === 'Fame Potion') {
                avgDailyQty = 0.6;
                baseChance = 0.30;
            } else if (prod.name === 'Dragon Scales' || prod.name === 'Phoenix Feathers') {
                avgDailyQty = 1.2;
                baseChance = 0.45;
            }

            // Apply Halloween multiplier if product is seasonal surge item
            let effectiveQty = avgDailyQty * weekendMultiplier;
            if (prod.is_halloween_surge) {
                effectiveQty *= seasonalMultiplier;
                baseChance = Math.min(0.95, baseChance * (seasonalMultiplier > 1.2 ? 1.4 : 1.0));
            }

            // Determine if a sale occurs today
            if (Math.random() < baseChance) {
                // Random variation around effectiveQty (Poisson/Gaussian approx)
                const variance = 0.6 + Math.random() * 0.8;
                let qty = Math.max(1, Math.round(effectiveQty * variance));

                // High spikes during the last 3 days of October for surge items
                if (daysToHalloween <= 3 && prod.is_halloween_surge) {
                    qty = Math.max(qty, Math.floor(4 + Math.random() * 6));
                }

                const total = Math.round(qty * prod.selling_price * 100) / 100;
                const cust = customerTypes[Math.floor(Math.random() * customerTypes.length)];
                const notes = daysToHalloween <= 7 && prod.is_halloween_surge 
                    ? 'Halloween Midnight Sabbath preparations'
                    : 'Standard apothecary order';

                insertSale.run(prod.id, qty, prod.selling_price, total, dateStr, cust, notes);
                totalSalesCount++;
            }
        }
    }
    console.log(`✅ Seeded ${totalSalesCount} historical sales transactions across 90 days.`);

    // 5. Initial Inventory Transactions (Audit Logs)
    console.log('📝 Seeding Inventory Transactions (Audit Logs)...');
    const insertTx = db.prepare(`
        INSERT INTO inventory_transactions (product_id, type, quantity, previous_stock, new_stock, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const prod of products) {
        // Initial opening stock
        insertTx.run(
            prod.id,
            'RESTOCK',
            50,
            0,
            50,
            'Autumn Solstice initial apothecary stock replenishment',
            '2026-08-01 09:00:00'
        );

        // Recent stock adjustment for notable items
        if (prod.name === 'Stardust') {
            insertTx.run(
                prod.id,
                'RESTOCK',
                100,
                45,
                145,
                'Over-purchased from Astral Nebula Miners bulk promotional portal',
                '2026-09-15 14:30:00'
            );
        } else if (prod.name === 'Fairy Wings') {
            insertTx.run(
                prod.id,
                'SALE',
                -18,
                21,
                3,
                'Pre-Halloween rush bulk purchase by Midnight Coven',
                '2026-10-30 18:45:00'
            );
        } else if (prod.name === 'Ghost Pepper') {
            insertTx.run(
                prod.id,
                'WASTE',
                -3,
                8,
                5,
                'Accidental spell spark combustion in rear storehouse',
                '2026-10-28 11:20:00'
            );
        }
    }
    console.log('✅ Seeded initial inventory audit trail.');

    console.log('🎉 Database seeding complete! Madam Hex\'s shop is fully prepared.');
}

if (require.main === module) {
    const db = initDatabase();
    seedData(db);
    db.close();
}

module.exports = { initDatabase, seedData, DB_PATH };
