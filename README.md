# Trading Journal — Deployment Guide

## What's in this folder

```
trading-journal/
├── index.html          ← app entry point
├── vite.config.js      ← build config
├── package.json        ← dependencies
└── src/
    ├── main.jsx        ← React mount
    └── App.jsx         ← entire app
```

---

## Step 1 — Install Node.js (if you don't have it)

Download from https://nodejs.org — pick the LTS version. Just run the installer.

---

## Step 2 — Test it locally first

Open a terminal, navigate to this folder, then run:

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser. You should see the journal with demo data.

---

## Step 3 — Deploy to Vercel (free, ~5 minutes)

### Option A: Via GitHub (recommended — enables auto-deploy on every edit)

1. Create a free account at https://github.com and https://vercel.com
2. Create a new GitHub repo (call it `trading-journal`)
3. Upload this entire folder's contents to the repo (drag and drop on GitHub works)
4. Go to https://vercel.com/new
5. Click "Import" next to your repo
6. Leave all settings as default — Vercel auto-detects Vite
7. Click Deploy

You'll get a URL like `https://trading-journal-abc123.vercel.app`. That's your live app.

**To update the app later:** just edit `src/App.jsx` in GitHub and commit. Vercel redeploys automatically in ~30 seconds.

### Option B: Via Vercel CLI (no GitHub needed)

```bash
npm install -g vercel
vercel login
vercel --prod
```

Follow the prompts. Done.

---

## Step 4 — Notion embed (optional)

1. Copy your Vercel URL
2. In Notion, type `/embed`
3. Paste the URL

Note: Notion sandboxes embeds, so the IBKR live connection won't work inside Notion.
Everything else (CSV upload, manual trades, AI analysis, charts) will work fine.
Bookmark the direct Vercel URL for full functionality.

---

## Data persistence — how it works

Your trades are saved in **localStorage** in your browser. This means:

| Scenario | Your data |
|---|---|
| You refresh the page | ✅ Safe — loads from localStorage |
| You deploy an update to Vercel | ✅ Safe — code updates don't touch browser storage |
| You open on a different browser/device | ❌ Not there — localStorage is per-browser |
| You clear browser data/cookies | ❌ Lost |

### To back up your trades (important):

Use the **Export CSV** button in the app to download your trades as a file. Do this regularly.
If you want cross-device sync, the upgrade path is to add a small backend (Supabase free tier works well — ask Claude to add it when you're ready).

---

## Making edits without losing data

Since data lives in localStorage (in your browser), **app code changes on Vercel never touch your trades**.

The only thing that would reset your data is if the `STORAGE_KEY` constant in `App.jsx` changes.
Currently it's set to `"trading_journal_v1"`. Don't change that string and your data persists forever across deployments.

---

## Connecting IBKR

IBKR Client Portal Gateway runs locally on your machine, not on Vercel.
So the "Connect IBKR" button only works when you're using the app on the same machine running the Gateway.

Steps:
1. Download IBKR Client Portal Gateway: https://www.interactivebrokers.com/en/trading/ib-gateway.php
2. Run it and log in
3. Open your Vercel URL in the browser on the same machine
4. Click "Connect IBKR"

For trade history, the easiest method is:
IBKR → Reports → Activity → Trades → Export CSV → Upload CSV in the app.
