const { getDb } = require('../config/db');

class ShopController {
    /**
     * Browse Available Magical Products (Potions & Ingredients)
     */
    getProducts(req, res) {
        try {
            const db = getDb();
            const {
                category,
                search,
                item_type,
                in_stock,
                sort = 'name_asc',
                limit = 50,
                offset = 0
            } = req.query;

            const conditions = ['p.is_archived = 0'];
            const params = [];

            if (category) {
                if (isNaN(category)) {
                    conditions.push('(c.slug = ? OR c.name = ?)');
                    params.push(category, category);
                } else {
                    conditions.push('p.category_id = ?');
                    params.push(Number(category));
                }
            }

            if (item_type) {
                conditions.push('p.item_type = ?');
                params.push(item_type);
            }

            if (search) {
                conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
                params.push(`%${search}%`, `%${search}%`);
            }

            if (in_stock === 'true' || in_stock === true) {
                conditions.push('p.current_stock > 0');
            }

            let orderBy = 'p.name ASC';
            if (sort === 'price_asc') orderBy = 'p.selling_price ASC';
            else if (sort === 'price_desc') orderBy = 'p.selling_price DESC';
            else if (sort === 'stock_desc') orderBy = 'p.current_stock DESC';
            else if (sort === 'newest') orderBy = 'p.id DESC';

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const countQuery = `
                SELECT COUNT(*) as total 
                FROM products p
                LEFT JOIN categories c ON c.id = p.category_id
                ${whereClause}
            `;
            const total = db.prepare(countQuery).get(...params).total;

            const dataQuery = `
                SELECT p.id, p.name, p.sku, p.item_type, p.category_id, p.description,
                       p.image_url, p.current_stock, p.selling_price, p.min_stock_level,
                       p.is_halloween_surge,
                       c.name as category_name, c.slug as category_slug, c.icon as category_icon
                FROM products p
                LEFT JOIN categories c ON c.id = p.category_id
                ${whereClause}
                ORDER BY ${orderBy}
                LIMIT ? OFFSET ?
            `;

            const rows = db.prepare(dataQuery).all(...params, Number(limit), Number(offset));

            const products = rows.map(p => ({
                id: p.id,
                name: p.name,
                sku: p.sku || `HEX-${p.id}`,
                item_type: p.item_type || 'potion',
                category_id: p.category_id,
                category_name: p.category_name,
                category_slug: p.category_slug,
                description: p.description,
                image_url: p.image_url,
                current_stock: p.current_stock,
                selling_price: p.selling_price,
                is_halloween_surge: Boolean(p.is_halloween_surge),
                stock_status: p.current_stock === 0 ? 'OUT_OF_STOCK' : p.current_stock <= 10 ? 'LOW_STOCK' : 'IN_STOCK'
            }));

            res.json({
                success: true,
                total,
                limit: Number(limit),
                offset: Number(offset),
                data: products
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'QUERY_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Get Single Product Details by ID
     */
    getProductById(req, res) {
        try {
            const db = getDb();
            const { id } = req.params;

            const p = db.prepare(`
                SELECT p.id, p.name, p.sku, p.item_type, p.category_id, p.description,
                       p.image_url, p.current_stock, p.selling_price, p.min_stock_level,
                       p.is_halloween_surge, p.is_archived,
                       c.name as category_name, c.slug as category_slug, c.icon as category_icon
                FROM products p
                LEFT JOIN categories c ON c.id = p.category_id
                WHERE p.id = ?
            `).get(id);

            if (!p || p.is_archived) {
                return res.status(404).json({
                    success: false,
                    error: 'NOT_FOUND',
                    message: 'Magical item not found in Madam Hex\'s grimoire.'
                });
            }

            // If it's a potion, fetch recipe ingredients
            let recipe = null;
            const recipeRow = db.prepare('SELECT id, name, description, brewing_time_hours, difficulty, instructions FROM recipes WHERE potion_product_id = ?').get(p.id);
            if (recipeRow) {
                const ingredients = db.prepare(`
                    SELECT ri.quantity_required, ri.unit, p.name, p.image_url
                    FROM recipe_ingredients ri
                    JOIN products p ON p.id = ri.ingredient_product_id
                    WHERE ri.recipe_id = ?
                `).all(recipeRow.id);

                recipe = {
                    ...recipeRow,
                    ingredients
                };
            }

            res.json({
                success: true,
                data: {
                    ...p,
                    is_halloween_surge: Boolean(p.is_halloween_surge),
                    stock_status: p.current_stock === 0 ? 'OUT_OF_STOCK' : p.current_stock <= 10 ? 'LOW_STOCK' : 'IN_STOCK',
                    recipe
                }
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'QUERY_FAILED',
                message: err.message
            });
        }
    }

    /**
     * Featured & Recommended Potions for User Dashboard
     */
    getFeatured(req, res) {
        try {
            const db = getDb();

            // Featured items: Potions with stock
            const featured = db.prepare(`
                SELECT p.id, p.name, p.sku, p.item_type, p.description, p.image_url, p.selling_price, p.current_stock,
                       c.name as category_name
                FROM products p
                JOIN categories c ON c.id = p.category_id
                WHERE p.is_archived = 0 AND p.current_stock > 0
                ORDER BY p.is_halloween_surge DESC, p.selling_price DESC
                LIMIT 4
            `).all();

            // Recommended items (Popular potions)
            const recommended = db.prepare(`
                SELECT p.id, p.name, p.sku, p.item_type, p.description, p.image_url, p.selling_price, p.current_stock,
                       c.name as category_name,
                       (SELECT COUNT(*) FROM sales WHERE product_id = p.id) as sales_count
                FROM products p
                JOIN categories c ON c.id = p.category_id
                WHERE p.is_archived = 0 AND p.current_stock > 0
                ORDER BY sales_count DESC
                LIMIT 4
            `).all();

            res.json({
                success: true,
                data: {
                    featured,
                    recommended,
                    seasonalOffers: [
                        {
                            code: 'HEX2026',
                            title: 'Hallowmere Nocturnal Gala',
                            discount: '15% Off All Restorative Tonics',
                            banner: 'Under the full moon, all Apprentice alchemists receive complimentary celestial guidance.'
                        },
                        {
                            code: 'STARFALL',
                            title: 'Celestial Stardust Harvest',
                            discount: 'Buy 2 Flying Potions, Get 1 Moon Dust Free',
                            banner: 'Mined directly from the Astral Verge by the Astromancers Guild.'
                        }
                    ]
                }
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'QUERY_FAILED',
                message: err.message
            });
        }
    }
}

module.exports = new ShopController();

