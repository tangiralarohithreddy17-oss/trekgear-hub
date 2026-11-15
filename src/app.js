const express = require('express');
const tentsRouter = require('./routes/tents');
const auditRouter = require('./routes/audit');

const app = express();

// Parse JSON request bodies
app.use(express.json());

// Routes
app.use('/tents', tentsRouter);
app.use('/audit', auditRouter);

// Health check / welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'TrekGear Hub API is running',
    version: '1.0.0'
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
