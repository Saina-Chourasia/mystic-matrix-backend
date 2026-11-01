const CategoryModel = require('../models/categoryModel');

class CategoryController {
    static getAll(req, res) {
        try {
            const categories = CategoryModel.getAll();
            res.json({ success: true, data: categories });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = CategoryController;

