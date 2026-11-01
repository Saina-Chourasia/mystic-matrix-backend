let DatabaseSync;
try {
    DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (err) {
    if (err.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
        throw new Error(
            "Node SQLite requires Node 22.5+ with the '--experimental-sqlite' flag enabled, or Node 24+. " +
            "Please start your server with 'npm start' or 'node --experimental-sqlite server.js', or set NODE_OPTIONS='--experimental-sqlite' in your environment."
        );
    }
    throw err;
}
const path = require('node:path');
const fs = require('node:fs');

function resolveDbPath(relPath) {
    const p1 = path.resolve(__dirname, '../', relPath);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.resolve(__dirname, '../../', relPath);
    if (fs.existsSync(p2)) return p2;
    return p1;
}

const DB_PATH = process.env.DB_PATH || resolveDbPath('database/hexventory.db');
const SCHEMA_PATH = resolveDbPath('database/schemas/schema.sql');
const SEED_MODULE = resolveDbPath('database/seed/seedData.js');
const MIGRATION_003 = resolveDbPath('database/migrations/run_003_migration.js');
const MIGRATION_005 = resolveDbPath('database/migrations/run_005_migration.js');

let dbInstance = null;

function getDb() {
    if (dbInstance) {
        return dbInstance;
    }

    const dbExists = fs.existsSync(DB_PATH);
    dbInstance = new DatabaseSync(DB_PATH);

    if (!dbExists) {
        console.log('🪄 No database found at', DB_PATH, '- Initializing schema & seeding...');
        const { initDatabase, seedData } = require(SEED_MODULE);
        seedData(dbInstance);
    } else {
        // Ensure foreign keys are enabled
        dbInstance.exec('PRAGMA foreign_keys = ON;');
        
        // Ensure Migration 003 is present
        const hasUsers = dbInstance.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get();
        if (!hasUsers) {
            try {
                const { runMigration } = require(MIGRATION_003);
                runMigration();
            } catch (mErr) {
                console.error('Auto-migration 003 error:', mErr.message);
            }
        }

        // Ensure Migration 005 (AI Agent Tables) is present
        const hasAiNotifs = dbInstance.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_notifications'").get();
        if (!hasAiNotifs) {
            try {
                const { runMigration: run005 } = require(MIGRATION_005);
                run005(dbInstance);
            } catch (mErr) {
                console.error('Auto-migration 005 error:', mErr.message);
            }
        }

        // Ensure Clerk ID column is present on users
        try {
            const userCols = dbInstance.prepare("PRAGMA table_info(users)").all();
            if (!userCols.some(c => c.name === 'clerk_id')) {
                dbInstance.exec("ALTER TABLE users ADD COLUMN clerk_id TEXT;");
                dbInstance.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id) WHERE clerk_id IS NOT NULL;");
            }
        } catch (cErr) {
            // Ignore if already altered
        }
    }

    return dbInstance;
}

module.exports = { getDb, DB_PATH };

