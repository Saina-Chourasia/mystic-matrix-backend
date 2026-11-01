const express = require('express');
const router = express.Router();
const RecipeController = require('../controllers/recipeController');

// POST /api/production
router.post('/', RecipeController.produce);

module.exports = router;

