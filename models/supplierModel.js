const { getDb } = require('../config/db');

class SupplierModel {
    static getAll() {
        const db = getDb();
        return db.prepare(`SELECT * FROM suppliers ORDER BY name ASC`).all();
    }

    static getById(id) {
        const db = getDb();
        return db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id);
    }
}

module.exports = SupplierModel;

