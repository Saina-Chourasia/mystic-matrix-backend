const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../hexventory.db');
const SQL_PATH = path.resolve(__dirname, '005_ai_agent_tables.sql');

function runMigration(existingDb) {
    const db = existingDb || new DatabaseSync(DB_PATH);
    console.log('🔮 Running Migration 005 (AI Inventory Agent Tables) on:', DB_PATH);

    db.exec('PRAGMA foreign_keys = ON;');
    const sql = fs.readFileSync(SQL_PATH, 'utf-8');
    db.exec(sql);
    console.log('✔ Migration 005 tables and indexes successfully verified.');
    return true;
}

if (require.main === module) {
    runMigration();
}

module.exports = { runMigration };

