const { getDb } = require('../config/db');

class CategoryModel {
    static getAll() {
        const db = getDb();
        return db.prepare(`SELECT * FROM categories ORDER BY name ASC`).all();
    }

    static getById(id) {
        const db = getDb();
        return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id);
    }
}

module.exports = CategoryModel;

