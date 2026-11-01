# MYSTIC MATRIX Relational Database Layer

The database layer powers Madam Hex's inventory management and statistical forecasting engine. It uses SQLite powered by Node.js 24's native `node:sqlite` (`DatabaseSync`), requiring zero external daemons, zero native compilation flags, and offering 100% ACID compliance and relational referential integrity.

---

## 🗄️ Relational Schema Design

```
categories (1) ────< products (M) ────< sales (M)
                          │
                          ├───────────< inventory_transactions (M)
                          │
                          ├───────────< forecasts (M)
                          │
suppliers (1) ────────────┘
```

### Tables Overview:
1. **`categories`**: Product taxonomy (`Magical Ingredients`, `Magical Potions`).
2. **`suppliers`**: Realm suppliers with lead times in days and reliability metrics.
3. **`products`**: 22 canonical magical reagents and potions with current stock, min/max thresholds, unit cost, price, reorder points, and Halloween surge tags.
4. **`sales`**: 90+ days of historical customer transactions with timestamps, customer types (Witch, Wizard, Necromancer, etc.), and unit totals.
5. **`inventory_transactions`**: Complete audit trail of stock movements (RESTOCK, SALE, WASTE, ADJUSTMENT, SPELL_FAILURE).
6. **`forecasts`**: Dynamically computed and cached statistical predictions (7-day and 30-day horizons, confidence intervals, reorder suggestions, stockout countdowns).

---

## 🚀 Commands

### Seed / Re-initialize Database
```bash
node database/seed/seedData.js
```
This runs `database/schemas/schema.sql` and generates 22 canonical products and over 1,000 realistic historical sales records.

### Database Location
The active database file is stored at `database/hexventory.db`.

