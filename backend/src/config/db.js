import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

let poolConnected = false;
let lastConnectionError = null;

// Test connection on initialization
pool.on('connect', () => {
  poolConnected = true;
  lastConnectionError = null;
  console.log('✓ Database connection pool established');
});

pool.on('error', (err) => {
  poolConnected = false;
  lastConnectionError = err;
  console.error('✗ Database connection error:', err.message);
});

// Attempt to verify connection
pool.query('SELECT 1').then(
  () => {
    poolConnected = true;
    lastConnectionError = null;
    console.log('✓ Database connection verified');
  },
  (err) => {
    poolConnected = false;
    lastConnectionError = err;
    console.error('✗ Database initialization failed:', err.message);
    console.error('  Make sure PostgreSQL is running at:', process.env.DATABASE_URL);
  }
);

export default pool;
export { poolConnected, lastConnectionError };
