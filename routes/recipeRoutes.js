const express = require('express');
const router = express.Router();
const RecipeController = require('../controllers/recipeController');

router.get('/', RecipeController.getAll);
router.post('/', RecipeController.create);
router.post('/ingredient-demand', RecipeController.getIngredientDemand);
router.post('/produce', RecipeController.produce);
router.get('/:id', RecipeController.getById);
router.patch('/:id', RecipeController.update);
router.put('/:id', RecipeController.update);
router.post('/:id/produce', RecipeController.produce);

module.exports = router;

