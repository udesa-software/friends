const express = require('express');
const friendsRouter = require('./modules/friends/friends.routes');
const reportsRouter = require('./modules/reports/reports.routes');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// H9: montar reportsRouter antes del friendsRouter para que /api/friends/report
// no sea capturado por la ruta dinámica /:friendId dentro de friendsRouter
app.use('/api/friends/report', reportsRouter);
app.use('/api/friends', friendsRouter);

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
