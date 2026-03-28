const express = require('express');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
