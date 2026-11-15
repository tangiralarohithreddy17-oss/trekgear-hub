const express = require('express');
const trekkersRouter = require('./routes/trekkers');
const tentsRouter = require('./routes/tents');
const rentalsRouter = require('./routes/rentals');
const auditRouter = require('./routes/audit');
const { getDb, allAsync } = require('./db');

const app = express();

app.use(express.json());

// Routes
app.use('/trekkers', trekkersRouter);
app.use('/tents', tentsRouter);
app.use('/rentals', rentalsRouter);
app.use('/audit', auditRouter);

// Root route: interactive HTML dashboard in browser, JSON in API clients
app.get('/', async (req, res) => {
  if (req.accepts('html')) {
    try {
      const db = getDb();
      const tents = await allAsync(db, 'SELECT * FROM tents LIMIT 5');
      const trekkers = await allAsync(db, 'SELECT * FROM trekkers LIMIT 5');
      const rentals = await allAsync(db, `
        SELECT rentals.rental_id, trekkers.name AS trekker_name, tents.tent_name, tents.size, rentals.status
        FROM rentals
        JOIN trekkers ON rentals.trekker_id = trekkers.trekker_id
        JOIN tents ON rentals.tent_id = tents.tent_id
        LIMIT 5;
      `);

      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>TrekGear Hub API Explorer</title>
          <style>
            :root {
              --primary: #10b981;
              --bg: #0f172a;
              --card: #1e293b;
              --text: #f8fafc;
              --text-muted: #94a3b8;
              --border: #334155;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: var(--bg);
              color: var(--text);
              margin: 0;
              padding: 24px;
              line-height: 1.5;
            }
            .container {
              max-width: 1000px;
              margin: 0 auto;
            }
            header {
              border-bottom: 1px solid var(--border);
              padding-bottom: 16px;
              margin-bottom: 24px;
            }
            h1 {
              color: var(--primary);
              margin: 0 0 8px 0;
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .badge {
              background: #064e3b;
              color: #34d399;
              padding: 4px 10px;
              border-radius: 9999px;
              font-size: 0.8rem;
              font-weight: bold;
            }
            .subtitle {
              color: var(--text-muted);
              margin: 0;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
              gap: 20px;
              margin-bottom: 24px;
            }
            .card {
              background: var(--card);
              border: 1px solid var(--border);
              border-radius: 10px;
              padding: 20px;
            }
            .card h3 {
              margin-top: 0;
              color: #38bdf8;
              border-bottom: 1px solid var(--border);
              padding-bottom: 8px;
            }
            ul {
              list-style-type: none;
              padding: 0;
              margin: 0;
            }
            li {
              padding: 8px 0;
              border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            a.link {
              color: #38bdf8;
              text-decoration: none;
              font-weight: 500;
              background: rgba(56, 189, 248, 0.1);
              padding: 4px 8px;
              border-radius: 4px;
              transition: all 0.2s;
              display: inline-block;
              margin-bottom: 4px;
            }
            a.link:hover {
              background: rgba(56, 189, 248, 0.25);
              text-decoration: underline;
            }
            .method {
              font-size: 0.75rem;
              font-weight: bold;
              padding: 2px 6px;
              border-radius: 4px;
              background: #1e3a8a;
              color: #93c5fd;
              margin-right: 6px;
            }
            .code-box {
              background: #020617;
              border-radius: 6px;
              padding: 12px;
              font-family: monospace;
              font-size: 0.85rem;
              overflow-x: auto;
              color: #a7f3d0;
            }
            .highlight-card {
              background: linear-gradient(135deg, #064e3b, #0f766e);
              border: 1px solid #14b8a6;
              border-radius: 10px;
              padding: 20px;
              margin-bottom: 24px;
            }
            .highlight-card h2 {
              margin-top: 0;
              color: #ccfbf1;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <header>
              <h1>TrekGear Hub API <span class="badge">Live & Active</span></h1>
              <p class="subtitle">Trekking Gear Rental Management System with Audit Trail & Relational Join Endpoints</p>
            </header>

            <div class="highlight-card">
              <h2>⭐ The Join Endpoint: /rentals</h2>
              <p>Joins active and past rental records with <strong>Trekker Name</strong> and <strong>Tent Name</strong> in a single SQL relational query.</p>
              <a class="link" style="background:#0f172a; color:#2dd4bf; font-size:1.1rem; padding:8px 16px;" href="/rentals" target="_blank">Open /rentals in Browser</a>
            </div>

            <h2>Direct Browser Verification Links</h2>
            <div class="grid">
              <div class="card">
                <h3>Rentals & Trekkers</h3>
                <ul>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/rentals" target="_blank">/rentals</a>
                    <div style="color:#34d399; font-weight:bold; font-size:0.85rem">⭐ THE JOIN ENDPOINT (Rentals + Trekker Name + Tent Name)</div>
                  </li>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/rentals/1" target="_blank">/rentals/1</a>
                    <div style="color:var(--text-muted); font-size:0.85rem">Single joined rental record</div>
                  </li>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/trekkers" target="_blank">/trekkers</a>
                    <div style="color:var(--text-muted); font-size:0.85rem">List of registered trekkers</div>
                  </li>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/trekkers/1" target="_blank">/trekkers/1</a>
                    <div style="color:var(--text-muted); font-size:0.85rem">Single trekker profile</div>
                  </li>
                </ul>
              </div>

              <div class="card">
                <h3>Tents Catalog & Search</h3>
                <ul>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/tents" target="_blank">/tents</a>
                    <div style="color:var(--text-muted); font-size:0.85rem">All tents in inventory</div>
                  </li>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/tents/1" target="_blank">/tents/1</a>
                    <div style="color:var(--text-muted); font-size:0.85rem">Single tent details</div>
                  </li>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/tents?size=4-person" target="_blank">/tents?size=4-person</a>
                    <div style="color:var(--text-muted); font-size:0.85rem">Filter tents by size (4-person)</div>
                  </li>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/tents?search_q=Mountain" target="_blank">/tents?search_q=Mountain</a>
                    <div style="color:var(--text-muted); font-size:0.85rem">Search tents by keyword (Mountain)</div>
                  </li>
                  <li>
                    <span class="method">GET</span> <a class="link" href="/audit" target="_blank">/audit</a>
                    <div style="color:#38bdf8; font-weight:bold; font-size:0.85rem">Audit trail (newest first, max 10)</div>
                  </li>
                </ul>
              </div>
            </div>

            <h2>Live Join Output Sample (/rentals)</h2>
            <div class="code-box">
              <pre>${JSON.stringify(rentals, null, 2)}</pre>
            </div>
          </div>
        </body>
        </html>
      `);
    } catch (e) {
      // Fallback to JSON below
    }
  }

  res.json({
    message: 'TrekGear Hub API is running',
    version: '1.0.0',
    endpoints: {
      trekkers: '/trekkers',
      tents: '/tents',
      rentals_join: '/rentals',
      audit: '/audit'
    }
  });
});

// 404 Handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
