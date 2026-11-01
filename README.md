# 🔮 Mystic Matrix Backend API

Enchanted Retail & Inventory Intelligence REST API for Madam Hex's Apothecary.  
Built with **Node.js (>=22.5.0)**, **Express**, **SQLite (`node:sqlite`)**, **Clerk Authentication**, and **Groq Cloud AI**.

---

## 🚀 Deploying to Render

This repository is pre-configured for one-click deployment on [Render](https://render.com/).

### 1. Create a New Web Service
1. In the [Render Dashboard](https://dashboard.render.com/), click **New → Web Service**.
2. Select this repository: `https://github.com/Saina-Chourasia/mystic-matrix-backend`.
3. Configure the build and start settings:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Node Version**: `22.11.0` (automatically picked up from `.node-version`)

### 2. Configure Environment Variables
In the Render Web Service **Environment** tab, set:

| Variable | Description |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22.11.0` |
| `ADMIN_EMAIL` | `madam.hex@gmail.com` |
| `CLERK_PUBLISHABLE_KEY` | Your Clerk Publishable Key (`pk_test_...`) |
| `CLERK_SECRET_KEY` | Your Clerk Secret Key (`sk_test_...`) |
| `GROQ_API_KEY` | Your Groq Cloud API Key (`gsk_...`) |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` |
| `FRONTEND_URL` | Your Vercel frontend URL (e.g. `https://mystic-matrix.vercel.app`) |

### 3. Database Persistence Note
- By default, the included SQLite database (`database/hexventory.db`) will be used.
- For permanent persistence on Render, attach a **Render Persistent Disk** mounted at `/var/data` and add:
  ```env
  DB_PATH=/var/data/hexventory.db
  ```

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run in production mode
npm start
```
Default port: `http://localhost:5001`. Health check available at `http://localhost:5001/api/health`.
