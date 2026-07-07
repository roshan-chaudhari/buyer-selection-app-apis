const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'buyersectionapp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Raise the MySQL max_allowed_packet to 20 MB to support Base64 annotated images stored in LONGTEXT
  maxAllowedPacket: 20 * 1024 * 1024,
});

// Test connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully.');
    connection.release();
  } catch (error) {
    console.error('Database connection failed on startup. Using pool. (Make sure your local DB is running & configured):', error.message);
  }
})();

module.exports = pool;
