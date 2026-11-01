const { getDb } = require('../config/db');

/**
 * RecipeService — The Potion Recipe Spellbook
 * Manages potion recipes, ingredient bills of materials (BOM),
 * craftability calculations, and atomic potion brewing production batches.
 */
class RecipeService {
    /**
     * Get all active recipes with live ingredient stock, craftability, and unit production cost
     */
    static getAllRecipes() {
        const db = getDb();
        const recipes = db.prepare(`
            SELECT 
                r.*,
                p.name as potion_name,
                p.sku as potion_sku,
                p.current_stock as potion_current_stock,
                p.selling_price as potion_selling_price,
                p.image_url as potion_image_url
            FROM recipes r
            JOIN products p ON r.potion_product_id = p.id
            WHERE r.is_active = 1
            ORDER BY r.id ASC
        `).all();

        const getIngredientsStmt = db.prepare(`
            SELECT 
                ri.id as recipe_ingredient_id,
                ri.ingredient_product_id,
                ri.quantity_required,
                ri.unit,
                p.name as ingredient_name,
                p.sku as ingredient_sku,
                p.current_stock,
                p.unit_cost,
                p.image_url
            FROM recipe_ingredients ri
            JOIN products p ON ri.ingredient_product_id = p.id
            WHERE ri.recipe_id = ?
            ORDER BY ri.id ASC
        `);

        return recipes.map(r => {
            const ingredients = getIngredientsStmt.all(r.id);

            let maxCraftable = Infinity;
            let limitingIngredient = null;
            let unitProductionCost = 0.0;
            const shortages = [];

            for (const ing of ingredients) {
                const required = ing.quantity_required || 1;
                const available = ing.current_stock || 0;
                const canMake = Math.floor(available / required);
                
                unitProductionCost += required * (ing.unit_cost || 0);

                if (canMake < maxCraftable) {
                    maxCraftable = canMake;
                    limitingIngredient = ing.ingredient_name;
                }

                if (available < required) {
                    shortages.push({
                        ingredient_id: ing.ingredient_product_id,
                        name: ing.ingredient_name,
                        required_per_unit: required,
                        available_stock: available,
                        units_missing: required - available
                    });
                }
            }

            if (maxCraftable === Infinity) maxCraftable = 0;
            unitProductionCost = Math.round(unitProductionCost * 100) / 100;
            const profitPerUnit = Math.round(((r.potion_selling_price || 0) - unitProductionCost) * 100) / 100;

            return {
                ...r,
                ingredients,
                max_craftable: maxCraftable,
                limiting_ingredient: limitingIngredient,
                unit_production_cost: unitProductionCost,
                profit_per_unit: profitPerUnit,
                shortages
            };
        });
    }

    /**
     * Get single recipe by ID
     */
    static getRecipeById(id) {
        const recipes = this.getAllRecipes();
        return recipes.find(r => r.id === parseInt(id, 10)) || null;
    }

    /**
     * Create a new custom recipe
     */
    static createRecipe({ potion_product_id, name, description, brewing_time_hours, difficulty, instructions, ingredients }) {
        const db = getDb();
        if (!potion_product_id || !name || !ingredients || !ingredients.length) {
            throw new Error('Missing required fields: potion_product_id, name, ingredients array.');
        }

        db.exec('BEGIN IMMEDIATE;');
        try {
            const res = db.prepare(`
                INSERT INTO recipes (potion_product_id, name, description, brewing_time_hours, difficulty, instructions)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                potion_product_id,
                name,
                description || '',
                brewing_time_hours || 2.0,
                difficulty || 'Apprentice',
                instructions || ''
            );

            const recipeId = res.lastInsertRowid;

            const insertIngStmt = db.prepare(`
                INSERT INTO recipe_ingredients (recipe_id, ingredient_product_id, quantity_required)
                VALUES (?, ?, ?)
            `);

            for (const ing of ingredients) {
                insertIngStmt.run(recipeId, ing.ingredient_product_id, ing.quantity_required);
            }

            db.exec('COMMIT;');
            return this.getRecipeById(recipeId);
        } catch (error) {
            db.exec('ROLLBACK;');
            throw error;
        }
    }

    /**
     * Update an existing recipe
     */
    static updateRecipe(id, data) {
        const db = getDb();
        const existing = this.getRecipeById(id);
        if (!existing) {
            throw new Error(`Recipe with ID ${id} not found.`);
        }

        db.exec('BEGIN IMMEDIATE;');
        try {
            db.prepare(`
                UPDATE recipes SET
                    name = COALESCE(?, name),
                    description = COALESCE(?, description),
                    brewing_time_hours = COALESCE(?, brewing_time_hours),
                    difficulty = COALESCE(?, difficulty),
                    instructions = COALESCE(?, instructions),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                data.name,
                data.description,
                data.brewing_time_hours,
                data.difficulty,
                data.instructions,
                id
            );

            if (data.ingredients && data.ingredients.length) {
                db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
                const insertIngStmt = db.prepare(`
                    INSERT INTO recipe_ingredients (recipe_id, ingredient_product_id, quantity_required)
                    VALUES (?, ?, ?)
                `);
                for (const ing of data.ingredients) {
                    insertIngStmt.run(id, ing.ingredient_product_id, ing.quantity_required);
                }
            }

            db.exec('COMMIT;');
            return this.getRecipeById(id);
        } catch (error) {
            db.exec('ROLLBACK;');
            throw error;
        }
    }

    /**
     * Atomic Potion Production Batch Execution (Section 3 Requirement)
     * 1. Validate recipe exists
     * 2. Verify all ingredients have sufficient stock
     * 3. Atomically deduct ingredients & log transactions
     * 4. Atomically increment potion stock & log transaction
     * 5. Record production batch
     */
    static produceBatch({ recipeId, quantity = 1, brewedBy = 'Madam Hex', notes }) {
        const db = getDb();
        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty <= 0) {
            throw new Error('Production batch quantity must be a positive integer.');
        }

        db.exec('BEGIN IMMEDIATE;');
        try {
            const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND is_active = 1').get(recipeId);
            if (!recipe) {
                throw new Error(`Recipe with ID ${recipeId} not found or inactive.`);
            }

            const potionProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(recipe.potion_product_id);
            if (!potionProduct) {
                throw new Error(`Potion product ID ${recipe.potion_product_id} not found.`);
            }

            // Fetch ingredients
            const ingredients = db.prepare(`
                SELECT 
                    ri.ingredient_product_id,
                    ri.quantity_required,
                    p.name,
                    p.current_stock,
                    p.unit_cost
                FROM recipe_ingredients ri
                JOIN products p ON ri.ingredient_product_id = p.id
                WHERE ri.recipe_id = ?
            `).all(recipeId);

            if (!ingredients.length) {
                throw new Error(`Recipe "${recipe.name}" has no ingredient definitions.`);
            }

            // Check stock sufficiency for ALL ingredients before deducting anything
            const insufficient = [];
            let totalBatchCost = 0.0;

            for (const ing of ingredients) {
                const totalRequired = ing.quantity_required * qty;
                totalBatchCost += totalRequired * (ing.unit_cost || 0);

                if (ing.current_stock < totalRequired) {
                    insufficient.push({
                        name: ing.name,
                        available: ing.current_stock,
                        required: totalRequired,
                        deficit: totalRequired - ing.current_stock
                    });
                }
            }

            // Reject with explicit shortage breakdown if insufficient (Section 3 Requirement)
            if (insufficient.length > 0) {
                const detail = insufficient.map(i => `${i.name} (need ${i.required}, only ${i.available} available)`).join(', ');
                throw new Error(`Cannot brew ${qty}x ${potionProduct.name}: Insufficient ingredients: ${detail}.`);
            }

            // Deduct each ingredient
            const deductStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            const insertTxStmt = db.prepare(`
                INSERT INTO inventory_transactions (product_id, type, quantity, previous_stock, new_stock, reason)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const ing of ingredients) {
                const consumed = ing.quantity_required * qty;
                const newIngStock = ing.current_stock - consumed;
                deductStmt.run(consumed, ing.ingredient_product_id);
                insertTxStmt.run(
                    ing.ingredient_product_id,
                    'CONSUMPTION',
                    -consumed,
                    ing.current_stock,
                    newIngStock,
                    `Brewing batch ${qty}x ${potionProduct.name}`
                );
            }

            // Increase finished potion stock
            const prevPotionStock = potionProduct.current_stock;
            const newPotionStock = prevPotionStock + qty;
            db.prepare('UPDATE products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(newPotionStock, potionProduct.id);

            insertTxStmt.run(
                potionProduct.id,
                'PRODUCTION',
                qty,
                prevPotionStock,
                newPotionStock,
                `Cauldron brew completion: ${qty}x ${potionProduct.name}`
            );

            // Record production batch
            const batchNum = `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const batchRes = db.prepare(`
                INSERT INTO production_batches (batch_number, recipe_id, potion_product_id, quantity_produced, total_cost, brewed_by, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
            `).run(batchNum, recipeId, potionProduct.id, qty, Math.round(totalBatchCost * 100) / 100, brewedBy, notes || `Batch of ${qty} brewed by ${brewedBy}`);

            db.exec('COMMIT;');

            return {
                batchId: batchRes.lastInsertRowid,
                batchNumber: batchNum,
                recipeName: recipe.name,
                potionName: potionProduct.name,
                quantityProduced: qty,
                previousStock: prevPotionStock,
                newStock: newPotionStock,
                totalCost: Math.round(totalBatchCost * 100) / 100,
                consumedIngredients: ingredients.map(i => ({
                    name: i.name,
                    quantityConsumed: i.quantity_required * qty,
                    remainingStock: i.current_stock - (i.quantity_required * qty)
                }))
            };
        } catch (error) {
            db.exec('ROLLBACK;');
            throw error;
        }
    }

    /**
     * Aggregate Ingredient Demand Planning (Section 3 Requirement)
     * Inputs array of planned potion targets: [{ potionId, plannedQuantity }]
     * Avoids double counting shared ingredients across multiple potions!
     */
    static calculateAggregatedIngredientDemand(plannedPotions = []) {
        const db = getDb();
        const recipes = this.getAllRecipes();
        const recipeMap = new Map();
        for (const r of recipes) {
            recipeMap.set(r.potion_product_id, r);
        }

        const aggregatedDemand = new Map();

        for (const plan of plannedPotions) {
            const potionId = parseInt(plan.potionId, 10);
            const plannedQty = parseInt(plan.plannedQuantity, 10) || 0;
            if (plannedQty <= 0) continue;

            const recipe = recipeMap.get(potionId);
            if (!recipe) continue;

            // Account for existing finished potion stock: Net production needed
            const currentFinishedStock = recipe.potion_current_stock || 0;
            const netProductionNeeded = Math.max(0, plannedQty - currentFinishedStock);

            for (const ing of recipe.ingredients) {
                const ingId = ing.ingredient_product_id;
                const unitsNeeded = netProductionNeeded * ing.quantity_required;

                if (!aggregatedDemand.has(ingId)) {
                    aggregatedDemand.set(ingId, {
                        ingredient_id: ingId,
                        ingredient_name: ing.ingredient_name,
                        ingredient_sku: ing.ingredient_sku,
                        current_stock: ing.current_stock,
                        unit_cost: ing.unit_cost,
                        total_gross_required: 0,
                        used_in_potions: []
                    });
                }

                const entry = aggregatedDemand.get(ingId);
                entry.total_gross_required += unitsNeeded;
                entry.used_in_potions.push({
                    potion_name: recipe.potion_name,
                    planned_potion_qty: plannedQty,
                    net_production_qty: netProductionNeeded,
                    ingredient_units: unitsNeeded
                });
            }
        }

        // Compute shortages & procurement cost
        const results = [];
        let totalProcurementCost = 0.0;

        for (const item of aggregatedDemand.values()) {
            const shortageUnits = Math.max(0, item.total_gross_required - item.current_stock);
            const procurementCost = Math.round(shortageUnits * (item.unit_cost || 0) * 100) / 100;
            totalProcurementCost += procurementCost;

            results.push({
                ...item,
                shortage_units: shortageUnits,
                is_shortage: shortageUnits > 0,
                procurement_cost: procurementCost
            });
        }

        return {
            plannedPotionsCount: plannedPotions.length,
            totalUniqueIngredients: results.length,
            totalProcurementCostNeeded: Math.round(totalProcurementCost * 100) / 100,
            ingredientRequirements: results
        };
    }
}

module.exports = RecipeService;

