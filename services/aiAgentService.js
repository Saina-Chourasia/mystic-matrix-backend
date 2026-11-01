/**
 * MYSTIC MATRIX AI Agent Service
 * "Mystic AI — The Inventory Oracle"
 *
 * Implements:
 * 1. Allowlisted read-only tool calling across 9 authorized tools
 * 2. Official Groq AI Cloud SDK integration (using groq-sdk and GROQ_API_KEY)
 * 3. Native tool calling with supported Groq models (default: llama-3.3-70b-versatile)
 * 4. Deterministic rule-based / heuristic oracle fallback (when key missing, invalid, or offline)
 * 5. Level 3 actionable proposal generator requiring explicit human approval
 * 6. Admin-only provider diagnostics and live connection test
 */

const { getDb } = require('../config/db');
const ForecastingService = require('./forecastingService');
const RecipeService = require('./recipeService');
const InventoryService = require('./inventoryService');
const ProductModel = require('../models/productModel');
const AiNotificationModel = require('../models/aiNotificationModel');
const AiMonitoringService = require('./aiMonitoringService');

// Groq / OpenAI compatible Tool Definitions for Function Calling
const GROQ_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'getInventorySummary',
            description: 'Get high-level summary of total catalog SKUs, stock valuation in Gold Galleons, retail valuation, healthy counts, out-of-stock items, and overstock exposure.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getLowStockProducts',
            description: 'Get list of products that are low in stock, below reorder point, or imminent to stock out within a specified day threshold.',
            parameters: {
                type: 'object',
                properties: {
                    thresholdDays: {
                        type: 'number',
                        description: 'Days until stockout threshold (e.g. 14 days). Defaults to 14.'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getOverstockProducts',
            description: 'Get list of overstocked products with excess units, capital trapped in Galleons, and holding costs.',
            parameters: {
                type: 'object',
                properties: {
                    minDaysCoverage: {
                        type: 'number',
                        description: 'Minimum days of demand coverage to consider overstocked (defaults to 60).'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getDemandForecast',
            description: 'Get statistical demand forecasts, accuracy benchmarks (MAE/WAPE), and seasonal multiplier projections for a specific product or top catalog items.',
            parameters: {
                type: 'object',
                properties: {
                    productId: {
                        type: 'number',
                        description: 'Specific product ID to forecast. If omitted, returns top critical catalog forecasts.'
                    },
                    horizonDays: {
                        type: 'number',
                        description: 'Forecast horizon in days (e.g. 7, 14, 30). Defaults to 30.'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getSupplierComparison',
            description: 'Compare suppliers for lead times, reliability scores, minimum order quantities, and active purchase orders.',
            parameters: {
                type: 'object',
                properties: {
                    productId: {
                        type: 'number',
                        description: 'Optional product ID to compare suppliers for.'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getSalesTrends',
            description: 'Get sales velocity, 30-day top selling products by volume and revenue, and gross profit margins.',
            parameters: {
                type: 'object',
                properties: {
                    days: {
                        type: 'number',
                        description: 'Lookback window in days (defaults to 30).'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getPendingOrders',
            description: 'Get all pending or in-transit supplier purchase orders and pending customer shop orders.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getIngredientShortages',
            description: 'Evaluate apothecary recipes, detect potions that cannot be brewed or have low craftable batches due to missing ingredients, and view required procurement costs.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getAdminNotifications',
            description: 'Retrieve active AI alerts and operational risk notifications from the inventory monitor.',
            parameters: {
                type: 'object',
                properties: {
                    severity: {
                        type: 'string',
                        description: 'Filter by CRITICAL, WARNING, or INFO.'
                    },
                    unreadOnly: {
                        type: 'boolean',
                        description: 'Whether to return only unread notifications (defaults to true).'
                    }
                },
                required: []
            }
        }
    }
];

class AiAgentService {
    static lastQueryProvider = null;
    static lastQueryTimestamp = null;
    static lastQueryModel = null;

    /**
     * Execute an allowlisted read-only tool
     */
    static async executeTool(toolName, args = {}) {
        const db = getDb();

        switch (toolName) {
            case 'getInventorySummary': {
                const valuation = InventoryService.getValuation();
                const totalSkus = db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_archived = 0').get().c;
                return {
                    totalSkus,
                    totalUnitsOnHand: valuation.totalUnitsOnHand,
                    totalValuationGalleons: valuation.totalCostValuation,
                    potentialRetailValue: valuation.totalRetailValuation,
                    projectedGrossProfit: valuation.potentialGrossProfit,
                    profitMarginPct: valuation.profitMarginPct,
                    stockoutRevenueExposure: valuation.stockoutRevenueExposure,
                    overstockedTiedUpCost: valuation.overstockedTiedUpCost,
                    healthBreakdown: valuation.counts
                };
            }

            case 'getLowStockProducts': {
                const threshold = args.thresholdDays || 14;
                const forecasts = ForecastingService.forecastAll();
                const lowItems = forecasts.filter(f => 
                    f.current_stock <= f.metrics.reorder_point || 
                    f.predictions.days_until_stockout <= threshold ||
                    f.predictions.stock_status === 'CRITICAL' ||
                    f.predictions.stock_status === 'OUT_OF_STOCK'
                ).map(f => ({
                    productId: f.product_id,
                    name: f.product_name,
                    sku: f.sku,
                    currentStock: f.current_stock,
                    dailyDemand: f.metrics.mean_daily_demand,
                    daysUntilStockout: f.predictions.days_until_stockout,
                    reorderPoint: f.metrics.reorder_point,
                    suggestedOrderQty: Math.max(f.predictions.suggested_reorder_qty, 25),
                    unitCost: f.unit_cost,
                    estimatedCost: Math.round(Math.max(f.predictions.suggested_reorder_qty, 25) * f.unit_cost),
                    supplier: f.supplier_name,
                    leadTimeDays: f.lead_time_days,
                    isHalloweenSurge: f.is_halloween_surge,
                    status: f.predictions.stock_status
                }));
                return { count: lowItems.length, thresholdDays: threshold, items: lowItems };
            }

            case 'getOverstockProducts': {
                const minDays = args.minDaysCoverage || 60;
                const forecasts = ForecastingService.forecastAll();
                const overstocked = forecasts.filter(f => {
                    const daily = f.metrics.mean_daily_demand || 0.1;
                    const daysCov = daily > 0 ? f.current_stock / daily : 999;
                    return daysCov >= minDays && f.current_stock > 80;
                }).map(f => {
                    const daily = f.metrics.mean_daily_demand || 0.1;
                    const daysCov = Math.round(f.current_stock / daily);
                    const excessUnits = Math.max(0, f.current_stock - Math.ceil(daily * 30));
                    const capitalTrapped = Math.round(excessUnits * f.unit_cost);
                    const monthlyHolding = Math.round(capitalTrapped * 0.02 * 100) / 100;
                    return {
                        productId: f.product_id,
                        name: f.product_name,
                        sku: f.sku,
                        currentStock: f.current_stock,
                        daysDemandCoverage: daysCov,
                        excessUnits,
                        capitalTrappedGalleons: capitalTrapped,
                        monthlyHoldingCost: monthlyHolding,
                        suggestedAction: 'Pause purchase orders; create promotional bundle with fast potions'
                    };
                });
                return { count: overstocked.length, minDaysCoverage: minDays, items: overstocked };
            }

            case 'getDemandForecast': {
                if (args.productId) {
                    const fc = ForecastingService.forecastProduct(args.productId, { horizonDays: args.horizonDays || 30 });
                    return {
                        productId: fc.product_id,
                        productName: fc.product_name,
                        currentStock: fc.current_stock,
                        leadTimeDays: fc.metrics.lead_time_days,
                        reorderPoint: fc.metrics.reorder_point,
                        safetyStock: fc.metrics.safety_stock,
                        seasonalFactor: fc.metrics.seasonal_factor,
                        projected30dDemand: fc.predictions.predicted_30d_demand,
                        daysUntilStockout: fc.predictions.days_until_stockout,
                        bestModel: fc.model_info.active_model_name,
                        accuracyMetrics: fc.model_info.accuracy_metrics,
                        explanation: fc.predictions.plain_explanation
                    };
                }
                const all = ForecastingService.forecastAll().slice(0, 5).map(f => ({
                    productId: f.product_id,
                    name: f.product_name,
                    stock: f.current_stock,
                    predicted30dDemand: f.predictions.predicted_30d_demand,
                    daysUntilStockout: f.predictions.days_until_stockout,
                    status: f.predictions.stock_status,
                    explanation: f.predictions.plain_explanation
                }));
                return { sampleForecasts: all };
            }

            case 'getSupplierComparison': {
                let sql = `
                    SELECT 
                        s.id AS supplier_id,
                        s.name AS supplier_name,
                        s.realm,
                        s.lead_time_days,
                        s.reliability_score,
                        COUNT(DISTINCT sp.product_id) AS products_supplied,
                        COUNT(DISTINCT CASE WHEN po.status IN ('PENDING', 'SUBMITTED', 'IN_TRANSIT') THEN po.id END) AS active_orders
                    FROM suppliers s
                    LEFT JOIN supplier_products sp ON s.id = sp.supplier_id
                    LEFT JOIN purchase_orders po ON s.id = po.supplier_id
                `;
                const params = [];
                if (args.productId) {
                    sql += ' WHERE sp.product_id = ?';
                    params.push(args.productId);
                }
                sql += ' GROUP BY s.id ORDER BY s.reliability_score DESC';

                const suppliers = db.prepare(sql).all(...params);
                return {
                    forProductId: args.productId || 'all',
                    suppliers: suppliers.map(s => ({
                        ...s,
                        reliabilityScorePct: `${Math.round(s.reliability_score * 100)}%`
                    }))
                };
            }

            case 'getSalesTrends': {
                return {
                    lookbackDays: args.days || 30,
                    rankings: AiMonitoringService.getProductRankingsAndAssortment().slice(0, 10)
                };
            }

            case 'getPendingOrders': {
                const purchaseOrders = db.prepare(`
                    SELECT 
                        po.id,
                        po.po_number,
                        po.status,
                        po.total_amount,
                        po.expected_delivery_date,
                        s.name AS supplier_name,
                        s.lead_time_days
                    FROM purchase_orders po
                    JOIN suppliers s ON po.supplier_id = s.id
                    WHERE po.status IN ('PENDING', 'SUBMITTED', 'IN_TRANSIT')
                    ORDER BY po.expected_delivery_date ASC
                `).all();

                const customerOrders = db.prepare(`
                    SELECT 
                        o.id,
                        o.order_number,
                        o.status,
                        o.total_amount,
                        o.created_at,
                        u.name AS customer_name,
                        u.email AS customer_email
                    FROM orders o
                    LEFT JOIN users u ON o.user_id = u.id
                    WHERE o.status IN ('PENDING', 'PROCESSING')
                    ORDER BY o.created_at DESC
                    LIMIT 10
                `).all();

                return {
                    pendingPurchaseOrdersCount: purchaseOrders.length,
                    pendingCustomerOrdersCount: customerOrders.length,
                    purchaseOrders,
                    customerOrders
                };
            }

            case 'getIngredientShortages': {
                const recipes = RecipeService.getAllRecipes();
                return {
                    totalRecipes: recipes.length,
                    recipes: recipes.map(r => ({
                        recipeId: r.id,
                        potionName: r.potion_name,
                        currentPotionStock: r.potion_current_stock,
                        maxCraftableBatches: r.max_craftable,
                        limitingIngredient: r.limiting_ingredient,
                        unitProductionCost: r.unit_production_cost,
                        sellingPrice: r.potion_selling_price,
                        shortages: r.shortages || []
                    }))
                };
            }

            case 'getAdminNotifications': {
                const notifs = AiNotificationModel.getAll({
                    severity: args.severity || null,
                    unreadOnly: args.unreadOnly !== undefined ? args.unreadOnly : true,
                    limit: 15
                });
                const stats = AiNotificationModel.getStats();
                return { stats, notifications: notifs };
            }

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Process user query through Groq SDK or fallback heuristic oracle
     */
    static async processQuery(userQuery, chatHistory = [], userContext = {}) {
        const groqKey = process.env.GROQ_API_KEY;

        if (groqKey && groqKey.trim() !== '') {
            try {
                return await this.callGroqAgent(userQuery, chatHistory, groqKey.trim());
            } catch (err) {
                console.warn('[AI Agent] Groq API call failed or unavailable, engaging deterministic oracle engine:', err.message);
                const fallback = await this.generateHeuristicResponse(userQuery, userContext);
                fallback.fallbackReason = err.message;
                AiAgentService.lastQueryProvider = 'heuristic_oracle';
                AiAgentService.lastQueryTimestamp = new Date().toISOString();
                AiAgentService.lastQueryModel = 'deterministic-rules-v1';
                return fallback;
            }
        }

        // Deterministic Rule-Based Oracle Engine Fallback
        AiAgentService.lastQueryProvider = 'heuristic_oracle';
        AiAgentService.lastQueryTimestamp = new Date().toISOString();
        AiAgentService.lastQueryModel = 'deterministic-rules-v1';
        return this.generateHeuristicResponse(userQuery, userContext);
    }

    /**
     * Official Groq Cloud SDK Function Calling Orchestrator
     */
    static async callGroqAgent(userQuery, chatHistory, apiKey) {
        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey });
        const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

        const systemMessage = {
            role: 'system',
            content: `You are Mystic AI — The Inventory Oracle, trusted magical inventory advisor to Madam Hex, owner of the 8-Bit Nocturnal Apothecary & Ingredient Emporium in Hallowmere.
Your primary role is to monitor inventory, analyze sales trends, evaluate supplier lead times, forecast demand for Halloween surges, and protect the apothecary against stockouts and trapped capital.

STRICT CONSTRAINTS:
1. NEVER calculate or guess inventory numbers, stockouts, or prices in your head. Always call the provided tools to retrieve real backend data.
2. If the user asks about low stock, restocks, overstock, ingredient shortages, forecasts, suppliers, or notifications, call the appropriate tool.
3. Keep your tone mystical, authoritative, helpful, and charmingly apothecary-themed (reference potions, gold galleons, midnight covens, Madam Hex).
4. When presenting lists of items, stock, or restock needs, format them cleanly in a Markdown table (| Product | SKU | Stock | ...) with concise metrics.
5. If an action would modify database records (e.g. creating a purchase order or changing prices), PROPOSE it as a Level 3 Action Proposal so Madam Hex can explicitly approve it. Never claim you executed a write action directly.`
        };

        const messages = [systemMessage];
        for (const msg of chatHistory.slice(-6)) {
            messages.push({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            });
        }
        messages.push({ role: 'user', content: userQuery });

        const toolsUsed = [];
        const toolResults = [];
        let suggestedActions = [];
        let finalResponseText = '';

        // Multi-turn tool calling loop (up to 3 turns)
        let turns = 0;
        while (turns < 3) {
            turns++;
            const completion = await groq.chat.completions.create({
                model,
                messages,
                tools: GROQ_TOOLS,
                tool_choice: 'auto',
                temperature: 0.2,
                max_tokens: 800
            });

            const choice = completion.choices && completion.choices[0];
            if (!choice || !choice.message) {
                throw new Error('Groq returned an empty response.');
            }

            const responseMessage = choice.message;

            // Check if model called any tools
            if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
                messages.push(responseMessage); // Add assistant message with tool_calls

                for (const toolCall of responseMessage.tool_calls) {
                    const toolName = toolCall.function.name;
                    let args = {};
                    try {
                        args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
                    } catch (e) {
                        args = {};
                    }

                    toolsUsed.push(toolName);
                    const toolOutput = await this.executeTool(toolName, args);
                    toolResults.push({ tool: toolName, output: toolOutput });

                    // Generate any Level 3 action proposals from tool output
                    suggestedActions = suggestedActions.concat(this.generateDraftActionsFromToolOutput(toolName, toolOutput));

                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: JSON.stringify(toolOutput)
                    });
                }
            } else {
                finalResponseText = responseMessage.content || 'The Oracle has communed with the ethereal ledger.';
                break;
            }
        }

        AiAgentService.lastQueryProvider = 'groq';
        AiAgentService.lastQueryTimestamp = new Date().toISOString();
        AiAgentService.lastQueryModel = model;

        return {
            response: finalResponseText,
            toolsUsed,
            toolResults,
            suggestedActions: suggestedActions.slice(0, 3),
            provider: 'groq',
            model
        };
    }

    /**
     * Deterministic Heuristic Oracle Engine (Offline / No Key Fallback)
     */
    static async generateHeuristicResponse(userQuery, userContext = {}) {
        const queryLower = (userQuery || '').toLowerCase();
        const toolsUsed = [];
        const toolResults = [];
        let suggestedActions = [];
        let response = '';

        if (queryLower.includes('halloween') || queryLower.includes('run out') || queryLower.includes('critical') || queryLower.includes('deplet')) {
            toolsUsed.push('getLowStockProducts');
            const lowStockData = await this.executeTool('getLowStockProducts', { thresholdDays: 14 });
            toolResults.push({ tool: 'getLowStockProducts', output: lowStockData });

            const criticalItems = lowStockData.items.filter(i => i.isHalloweenSurge || i.daysUntilStockout <= 14);

            response = `### 🎃 Hallowmere Eve Inventory Risk Assessment\n\n` +
                `Greetings, Madam Hex. The Oracle has scried the ledger against approaching seasonal demand curves.\n\n` +
                `| Potion / Reagent | Current Stock | Burn Rate / Day | Days to Depletion | Reorder Point | Suggested Order | Est. Cost |\n` +
                `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

            for (const item of criticalItems.slice(0, 5)) {
                response += `| **${item.name}** | ${item.currentStock} | ${item.dailyDemand} | **${item.daysUntilStockout} days** | ${item.reorderPoint} | ${item.suggestedOrderQty} units | ${item.estimatedCost}G |\n`;
                suggestedActions.push({
                    action_type: 'DRAFT_RESTOCK_PO',
                    target_entity: 'purchase_order',
                    title: `Restock Order: ${item.suggestedOrderQty}x ${item.name}`,
                    justification: `Current stock of ${item.currentStock} units will deplete in ${item.daysUntilStockout} days due to Halloween surge. Reordering ${item.suggestedOrderQty} units prevents midnight stockouts.`,
                    proposed_payload: {
                        productId: item.productId,
                        productName: item.name,
                        quantity: item.suggestedOrderQty,
                        unitCost: item.unitCost,
                        totalCost: item.estimatedCost,
                        supplierName: item.supplier,
                        leadTimeDays: item.leadTimeDays
                    }
                });
            }

            response += `\n**Oracle Recommendation:** Restock orders should be dispatched immediately to accommodate supplier transit times before the coven festivities begin!`;

        } else if (queryLower.includes('brew') || queryLower.includes('ingredient') || queryLower.includes('shortage') || queryLower.includes('recipe')) {
            toolsUsed.push('getIngredientShortages');
            const shortages = await this.executeTool('getIngredientShortages');
            toolResults.push({ tool: 'getIngredientShortages', output: shortages });

            response = `### 🧪 Apothecary Cauldron & Brewing Capacity Audit\n\n` +
                `Madam Hex, the Oracle has examined our bubbling cauldrons and raw reagent stores.\n\n` +
                `| Potion Formula | Current Potion Stock | Craftable Batches | Limiting Ingredient | Production Cost | Selling Price |\n` +
                `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

            for (const r of shortages.recipes) {
                const alert = r.maxCraftableBatches <= 10 ? ' ⚠️' : ' ✔';
                response += `| **${r.potionName}** | ${r.currentPotionStock} units | **${r.maxCraftableBatches}**${alert} | ${r.limitingIngredient} | ${r.unitProductionCost}G | ${r.sellingPrice}G |\n`;
                
                if (r.maxCraftableBatches <= 10) {
                    suggestedActions.push({
                        action_type: 'DRAFT_RESTOCK_PO',
                        target_entity: 'purchase_order',
                        title: `Procure Reagents for ${r.potionName}`,
                        justification: `Cauldrons can only produce ${r.maxCraftableBatches} more batches of ${r.potionName} before ${r.limitingIngredient} runs out.`,
                        proposed_payload: {
                            potionName: r.potionName,
                            limitingIngredient: r.limitingIngredient,
                            suggestedReagentOrderQty: 50
                        }
                    });
                }
            }

            response += `\n**Key Finding:** Reagent bottlenecks on *Moon Dust* and *Phoenix Feathers* are restricting high-margin potion production.`;

        } else if (queryLower.includes('overstock') || queryLower.includes('trapped') || queryLower.includes('gold') || queryLower.includes('holding cost')) {
            toolsUsed.push('getOverstockProducts');
            const overstockData = await this.executeTool('getOverstockProducts');
            toolResults.push({ tool: 'getOverstockProducts', output: overstockData });

            response = `### 💰 Overstock & Trapped Working Capital Analysis\n\n` +
                `Madam Hex, our vaulted storehouses contain significant capital sleeping in excess inventory.\n\n` +
                `| Item Name | On Hand | Demand Coverage | Excess Units | Trapped Gold | Monthly Holding Cost |\n` +
                `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

            let totalTrapped = 0;
            for (const item of overstockData.items) {
                totalTrapped += item.capitalTrappedGalleons;
                response += `| **${item.name}** | ${item.currentStock} units | ${item.daysDemandCoverage} days | ${item.excessUnits} | **${item.capitalTrappedGalleons}G** | ${item.monthlyHoldingCost}G |\n`;

                suggestedActions.push({
                    action_type: 'LAUNCH_PROMOTION',
                    target_entity: 'promotion',
                    title: `Create Clearance Bundle for ${item.name}`,
                    justification: `Overstock of ${item.currentStock} units is trapping ${item.capitalTrappedGalleons}G with holding costs of ${item.monthlyHoldingCost}G/month.`,
                    proposed_payload: {
                        productId: item.productId,
                        productName: item.name,
                        suggestedDiscountPct: 15,
                        bundleRecommendation: 'Bundle with fast-selling Flying Potion'
                    }
                });
            }

            response += `\n**Total Trapped Capital:** **${totalTrapped.toLocaleString()} Gold Galleons**.\n` +
                `**Oracle Strategy:** We recommend halting all incoming purchase orders for these items and offering temporary promotional bundles.`;

        } else if (queryLower.includes('supplier') || queryLower.includes('lead time') || queryLower.includes('vendor')) {
            toolsUsed.push('getSupplierComparison');
            const supplierData = await this.executeTool('getSupplierComparison');
            toolResults.push({ tool: 'getSupplierComparison', output: supplierData });

            response = `### 📜 Guild Supplier Reliability & Lead Time Matrix\n\n` +
                `Madam Hex, here is our operational comparison of trusted trade guilds across the realms:\n\n` +
                `| Supplier Guild | Realm | Lead Time | Reliability Score | Products Supplied | Active POs |\n` +
                `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

            for (const s of supplierData.suppliers) {
                response += `| **${s.supplier_name}** | ${s.realm} | ${s.lead_time_days} days | **${s.reliabilityScorePct}** | ${s.products_supplied} items | ${s.active_orders} active |\n`;
            }

            response += `\n**Oracle Insight:** *Phoenix Flame Sanctuary* boasts our highest reliability (98%), while *Grimoire Hollow Guild* offers the fastest turnaround (2 days) for emergency midnight replenishment.`;

        } else if (queryLower.includes('trend') || queryLower.includes('best seller') || queryLower.includes('sales') || queryLower.includes('velocity')) {
            toolsUsed.push('getSalesTrends');
            const salesData = await this.executeTool('getSalesTrends');
            toolResults.push({ tool: 'getSalesTrends', output: salesData });

            response = `### 📈 30-Day Sales Velocity & Product Assortment Ranking\n\n` +
                `Madam Hex, our bestsellers and trending potions for the past 30 days:\n\n` +
                `| Product Name | Category | Units Sold | 30d Revenue | Gross Margin | Velocity | Classification |\n` +
                `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

            for (const item of salesData.rankings.slice(0, 6)) {
                response += `| **${item.name}** | ${item.category} | ${item.unitsSold30d} | ${item.revenue30d}G | ${item.grossMarginPct}% | ${item.velocity}/day | **${item.classification}** |\n`;
            }

            response += `\n**Oracle Recommendation:** Feature high-margin bestsellers (*Healing Potion* and *Bat Wings*) prominently on the customer portal front counter!`;

        } else if (queryLower.includes('notification') || queryLower.includes('alert') || queryLower.includes('status')) {
            toolsUsed.push('getAdminNotifications');
            const notifData = await this.executeTool('getAdminNotifications');
            toolResults.push({ tool: 'getAdminNotifications', output: notifData });

            response = `### 🔮 Active Apothecary Intelligence Alerts\n\n` +
                `Madam Hex, you have **${notifData.stats.unread} unread operational alerts** (${notifData.stats.critical} Critical, ${notifData.stats.warning} Warnings):\n\n`;

            for (const n of notifData.notifications.slice(0, 5)) {
                const icon = n.severity === 'CRITICAL' ? '🔴' : (n.severity === 'WARNING' ? '🟡' : '🔵');
                response += `- ${icon} **[${n.severity}] ${n.title}**: ${n.message}\n`;
            }

        } else {
            // General Apothecary Inventory Overview
            toolsUsed.push('getInventorySummary');
            const summary = await this.executeTool('getInventorySummary');
            toolResults.push({ tool: 'getInventorySummary', output: summary });

            response = `### 🔮 Mystic Matrix — Executive Inventory Oracle Briefing\n\n` +
                `Welcome, Madam Hex. The arcane ledgers of Hallowmere are synchronized and operating nominally.\n\n` +
                `- **Total Active Catalog SKUs:** ${summary.totalSkus} items\n` +
                `- **Apothecary Inventory Valuation:** **${summary.totalValuationGalleons.toLocaleString()} Gold Galleons**\n` +
                `- **Projected Retail Valuation:** **${summary.potentialRetailValue.toLocaleString()} Gold Galleons**\n` +
                `- **Projected Unrealized Gross Margin:** **${summary.projectedGrossProfit.toLocaleString()} Gold Galleons**\n\n` +
                `**Catalog Health Status:**\n` +
                `- 🟢 **Healthy / In Stock:** ${summary.healthBreakdown.healthy} items\n` +
                `- 🟡 **Low Stock Watchlist:** ${summary.healthBreakdown.lowStock} items\n` +
                `- 🔴 **Depleted / Stockout Risk:** ${summary.healthBreakdown.outOfStock} items\n` +
                `- 🟣 **Overstock / Trapped Capital:** ${summary.healthBreakdown.overstocked} items\n\n` +
                `Ask me anything about imminent stockouts, cauldron brewing capacity, overstock discounts, supplier comparisons, or Halloween surge preparations!`;
        }

        return {
            response,
            toolsUsed,
            toolResults,
            suggestedActions: suggestedActions.slice(0, 3),
            provider: 'heuristic_oracle',
            model: 'deterministic-rules-v1'
        };
    }

    /**
     * Convert tool outputs into Level 3 Action Approval proposals
     */
    static generateDraftActionsFromToolOutput(toolName, output) {
        const actions = [];
        if (toolName === 'getLowStockProducts' && output.items) {
            for (const item of output.items.slice(0, 2)) {
                actions.push({
                    action_type: 'DRAFT_RESTOCK_PO',
                    target_entity: 'purchase_order',
                    title: `Restock Order: ${item.suggestedOrderQty}x ${item.name}`,
                    justification: `Current stock of ${item.currentStock} units will deplete in ${item.daysUntilStockout} days. Reordering ${item.suggestedOrderQty} units prevents midnight stockouts.`,
                    proposed_payload: {
                        productId: item.productId,
                        productName: item.name,
                        quantity: item.suggestedOrderQty,
                        unitCost: item.unitCost,
                        totalCost: item.estimatedCost,
                        supplierName: item.supplier,
                        leadTimeDays: item.leadTimeDays
                    }
                });
            }
        }
        return actions;
    }

    /**
     * Admin-Only Diagnostics Inspection
     */
    static async getDiagnostics() {
        const groqKey = process.env.GROQ_API_KEY;
        const isConfigured = Boolean(groqKey && groqKey.trim() !== '');
        const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

        let maskedKey = null;
        if (isConfigured) {
            const trimmed = groqKey.trim();
            maskedKey = trimmed.length > 8 
                ? `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}` 
                : '****';
        }

        const availableTools = GROQ_TOOLS.map(t => t.function.name);

        return {
            configuredProvider: 'groq',
            activeProvider: isConfigured ? 'groq' : 'heuristic_oracle',
            model: isConfigured ? model : 'deterministic-rules-v1',
            groqKeyConfigured: isConfigured,
            groqMaskedKey: maskedKey,
            groqModel: model,
            toolCallingEnabled: true,
            toolsCount: availableTools.length,
            availableTools,
            guardrailLevel: 'Level 3 (Human Admin Approval Strictly Enforced)',
            lastQueryProvider: AiAgentService.lastQueryProvider || (isConfigured ? 'groq' : 'heuristic_oracle'),
            lastQueryTimestamp: AiAgentService.lastQueryTimestamp || null,
            lastQueryModel: AiAgentService.lastQueryModel || (isConfigured ? model : 'deterministic-rules-v1'),
            sdk: 'groq-sdk',
            sdkVersion: '1.6.0',
            systemStatus: 'ONLINE'
        };
    }

    /**
     * Live Ping Provider Test (Admin Only)
     */
    static async pingProvider() {
        const groqKey = process.env.GROQ_API_KEY;
        const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

        if (!groqKey || groqKey.trim() === '') {
            return {
                success: false,
                status: 'FALLBACK_ACTIVE',
                provider: 'heuristic_oracle',
                model: 'deterministic-rules-v1',
                message: 'No GROQ_API_KEY configured in environment or .env. Deterministic fallback oracle is fully operational with all 9 read-only tools and Level 3 guardrails.'
            };
        }

        const startTime = Date.now();
        try {
            const Groq = require('groq-sdk');
            const groq = new Groq({ apiKey: groqKey.trim() });
            const completion = await groq.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'Respond with the single word PONG.' }],
                max_tokens: 5,
                temperature: 0
            });
            const latencyMs = Date.now() - startTime;
            const reply = completion.choices[0]?.message?.content?.trim() || 'OK';

            return {
                success: true,
                status: 'CONNECTED',
                provider: 'groq',
                model,
                latencyMs,
                reply,
                message: `Successfully connected to Groq Cloud (${model}) in ${latencyMs}ms.`
            };
        } catch (err) {
            return {
                success: false,
                status: 'FALLBACK_ACTIVE',
                provider: 'heuristic_oracle',
                model: 'deterministic-rules-v1',
                error: err.message,
                message: `Groq connection failed: ${err.message}. Deterministic fallback oracle is active.`
            };
        }
    }
}

module.exports = AiAgentService;
