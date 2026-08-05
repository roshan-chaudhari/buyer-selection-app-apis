const mysql = require("mysql2/promise");
require("./env");

let pool;

async function initializePool() {
  const localConfig = {
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "Ptex@123",
    database: "buyersectionapp",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    maxAllowedPacket: 20 * 1024 * 1024,
  };

  const azureConfig = {
    host: "buyersectionapp-mysql.mysql.database.azure.com",
    port: 3306,
    user: "sjaiswal",
    password: "Ptex@123456",
    database: "buyersectionapp",
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    maxAllowedPacket: 20 * 1024 * 1024,
  };

  // If a DB_HOST environment variable is explicitly provided (like 'db' in docker-compose,
  // or overridden via AWS/production environment), use it directly.
  if (process.env.DB_HOST && process.env.DB_HOST !== "127.0.0.1" && process.env.DB_HOST !== "buyersectionapp-mysql.mysql.database.azure.com") {
    const customConfig = {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE || "buyersectionapp",
      ssl: process.env.DB_SSL === "true" || process.env.DB_HOST.includes("database.azure.com") ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      maxAllowedPacket: 20 * 1024 * 1024,
    };
    console.log(`[Database] Using custom configuration for host: ${customConfig.host}`);
    pool = mysql.createPool(customConfig);
    return;
  }

  // Otherwise, attempt to connect to localhost first
  try {
    console.log("[Database] Checking if local MySQL is running on 127.0.0.1:3306...");
    const testConnection = await mysql.createConnection({
      host: localConfig.host,
      port: localConfig.port,
      user: localConfig.user,
      password: localConfig.password,
      database: localConfig.database,
      connectTimeout: 2000, // 2 seconds timeout for fast fallback
    });
    console.log("[Database] Local MySQL detected. Using local database pool.");
    await testConnection.end();
    pool = mysql.createPool(localConfig);
  } catch (error) {
    console.log(`[Database] Local MySQL not available (failed to connect: ${error.message}). Falling back to Azure MySQL database.`);
    pool = mysql.createPool(azureConfig);
  }
}

// Create a proxy object for the pool so we can export it synchronously but initialize it asynchronously
const poolProxy = {
  query: async (...args) => {
    if (!pool) await poolPromise;
    return pool.query(...args);
  },
  getConnection: async (...args) => {
    if (!pool) await poolPromise;
    return pool.getConnection(...args);
  }
};

const poolPromise = initializePool().catch(err => {
  console.error("[Database] Critical failure during pool initialization:", err);
});

module.exports = poolProxy;
