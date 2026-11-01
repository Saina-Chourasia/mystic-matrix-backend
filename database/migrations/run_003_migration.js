const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
let bcrypt;
try {
    bcrypt = require('bcryptjs');
} catch (e) {
    bcrypt = require(path.resolve(__dirname, '../../backend/node_modules/bcryptjs'));
}

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../hexventory.db');
const SQL_PATH = path.resolve(__dirname, '003_auth_portals_datasets.sql');

function runMigration() {
    console.log('🔮 Running Migration 003 (Auth, Portals, Datasets) on:', DB_PATH);
    const db = new DatabaseSync(DB_PATH);

    db.exec('PRAGMA foreign_keys = ON;');

    // 1. Safely add provenance and order_id columns to sales if missing
    const salesCols = db.prepare('PRAGMA table_info(sales)').all().map(c => c.name);
    if (!salesCols.includes('provenance')) {
        console.log('  Adding provenance column to sales...');
        db.exec("ALTER TABLE sales ADD COLUMN provenance TEXT DEFAULT 'DEMO_POTION_SHOP';");
    }
    if (!salesCols.includes('order_id')) {
        console.log('  Adding order_id column to sales...');
        db.exec("ALTER TABLE sales ADD COLUMN order_id INTEGER REFERENCES orders(id);");
    }

    // 2. Safely add provenance and order_id columns to inventory_transactions if missing
    const transCols = db.prepare('PRAGMA table_info(inventory_transactions)').all().map(c => c.name);
    if (!transCols.includes('provenance')) {
        console.log('  Adding provenance column to inventory_transactions...');
        db.exec("ALTER TABLE inventory_transactions ADD COLUMN provenance TEXT DEFAULT 'DEMO_POTION_SHOP';");
    }
    if (!transCols.includes('order_id')) {
        console.log('  Adding order_id column to inventory_transactions...');
        db.exec("ALTER TABLE inventory_transactions ADD COLUMN order_id INTEGER REFERENCES orders(id);");
    }

    // 3. Execute Schema SQL
    const sql = fs.readFileSync(SQL_PATH, 'utf-8');
    db.exec(sql);
    console.log('✔ Migration 003 tables and indexes verified.');

    // 4. Seed Dataset Sources Metadata
    const insertSource = db.prepare(`
        INSERT INTO dataset_sources (key, name, category, description, attribution, source_url, record_count, date_range_start, date_range_end, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            description = excluded.description,
            attribution = excluded.attribution,
            source_url = excluded.source_url
    `);

    insertSource.run(
        'fictional_apothecary',
        "Madam Hex's Potion Apothecary (Demo)",
        'DEMO DATA',
        "Synthetic enchanted potion and arcane ingredient retail records for Madam Hex's nocturnal emporium in Hallowmere.",
        "Mystic Matrix Apothecary Lore (Fictional Demo Environment)",
        "internal://fictional-apothecary",
        1137,
        '2024-01-01',
        '2026-10-31',
        1
    );

    insertSource.run(
        'uci_online_retail_ii',
        "UCI Online Retail II (Real Dataset)",
        'REAL DATA',
        "Official UCI Machine Learning Repository dataset containing 1,067,371 real retail transactions from a UK-based non-store online gift retailer between 01/12/2009 and 09/12/2011.",
        "Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D",
        "https://archive.ics.uci.edu/dataset/502/online+retail+ii",
        1067371,
        '2009-12-01',
        '2011-12-09',
        1
    );
    console.log('✔ Dataset sources metadata cataloged (DEMO DATA & REAL DATA).');

    // 5. Secure One-Time Server-Side Admin Provisioning (Madam Hex)
    const crypto = require('crypto');
    const adminEmail = (process.env.ADMIN_EMAIL || 'madam.hex@gmail.com').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || null;
    const existingAdmin = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(adminEmail);

    if (!existingAdmin) {
        const adminHash = adminPassword
            ? bcrypt.hashSync(adminPassword, bcrypt.genSaltSync(12))
            : ('REVOKED_OAUTH_LOCKED_' + crypto.randomBytes(32).toString('hex'));
        const res = db.prepare(`
            INSERT INTO users (email, password_hash, role, name, preferences, is_active)
            VALUES (?, ?, 'ADMIN', 'Madam Hex', '{"theme":"night","notifications":true}', 1)
        `).run(adminEmail, adminHash);
        console.log(`✔ Provisioned initial authoritative ADMIN account: ${adminEmail} (User ID: ${res.lastInsertRowid})`);
    } else {
        // Ensure role is ADMIN
        if (existingAdmin.role !== 'ADMIN') {
            db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(existingAdmin.id);
        }
        console.log(`✔ Authoritative ADMIN account already present: ${adminEmail}`);
    }

    // 6. Provision Sample Demonstration Customer User (for immediate User Portal testing)
    const demoUserEmail = 'apprentice@hallowmere.com';
    const existingCustomer = db.prepare('SELECT id, email FROM users WHERE email = ?').get(demoUserEmail);
    if (!existingCustomer) {
        const salt = bcrypt.genSaltSync(12);
        const userHash = bcrypt.hashSync('Hallowmere2026!Spell', salt);
        const res = db.prepare(`
            INSERT INTO users (email, password_hash, role, name, preferences, is_active)
            VALUES (?, ?, 'USER', 'Valerius the Apprentice', '{"theme":"night","favorite_category":"Potions"}', 1)
        `).run(demoUserEmail, userHash);
        console.log(`✔ Provisioned demo USER account: ${demoUserEmail} (User ID: ${res.lastInsertRowid})`);

        // Create empty cart for this user
        db.prepare('INSERT OR IGNORE INTO carts (user_id) VALUES (?)').run(res.lastInsertRowid);
    }

    console.log('\n🎉 MIGRATION 003 COMPLETED SUCCESSFULLY!\n');
}

if (require.main === module) {
    runMigration();
}

module.exports = { runMigration };
