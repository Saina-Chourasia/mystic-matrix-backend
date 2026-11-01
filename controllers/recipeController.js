const RecipeService = require('../services/recipeService');

class RecipeController {
    static getAll(req, res) {
        try {
            const recipes = RecipeService.getAllRecipes();
            res.json({ success: true, count: recipes.length, data: recipes });
        } catch (error) {
            console.error('Error fetching recipes:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static getById(req, res) {
        try {
            const recipe = RecipeService.getRecipeById(req.params.id);
            if (!recipe) {
                return res.status(404).json({ success: false, message: 'Potion recipe not found in grimoire.' });
            }
            res.json({ success: true, data: recipe });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static create(req, res) {
        try {
            const newRecipe = RecipeService.createRecipe(req.body);
            res.status(201).json({
                success: true,
                message: `Recipe "${newRecipe.name}" inscribed into Madam Hex's spellbook.`,
                data: newRecipe
            });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    static update(req, res) {
        try {
            const updated = RecipeService.updateRecipe(req.params.id, req.body);
            res.json({
                success: true,
                message: `Recipe "${updated.name}" updated in spellbook.`,
                data: updated
            });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    static produce(req, res) {
        try {
            const recipeId = req.params.id || req.body.recipeId || req.body.recipe_id;
            const quantity = req.body.quantity || 1;
            const brewedBy = req.body.brewedBy || req.adminUser?.name || 'Madam Hex';
            const notes = req.body.notes;

            if (!recipeId) {
                return res.status(400).json({ success: false, message: 'Recipe ID is required.' });
            }

            const result = RecipeService.produceBatch({
                recipeId: parseInt(recipeId, 10),
                quantity: parseInt(quantity, 10),
                brewedBy,
                notes
            });

            res.status(201).json({
                success: true,
                message: `Successfully brewed ${result.quantityProduced}x ${result.potionName}! Consumed ingredients deducted from shelves.`,
                data: result
            });
        } catch (error) {
            const isShortage = error.message.includes('Insufficient ingredients') || error.message.includes('not found');
            res.status(isShortage ? 400 : 500).json({ success: false, message: error.message });
        }
    }

    static getIngredientDemand(req, res) {
        try {
            const { plannedPotions } = req.body;
            if (!plannedPotions || !Array.isArray(plannedPotions)) {
                return res.status(400).json({ success: false, message: 'plannedPotions array is required: [{ potionId, plannedQuantity }].' });
            }

            const result = RecipeService.calculateAggregatedIngredientDemand(plannedPotions);
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = RecipeController;

