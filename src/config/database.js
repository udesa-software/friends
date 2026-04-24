const { Pool } = require('pg');
const { env } = require('./env');

const SSL_CONFIG = { rejectUnauthorized: false };

const pool = new Pool({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: SSL_CONFIG,
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
