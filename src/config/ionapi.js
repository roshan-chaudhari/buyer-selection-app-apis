const fs = require('fs');
const path = require('path');

let cachedConfig = null;

/**
 * Searches the given directory for any file with a .ionapi extension.
 * Returns the parsed JSON configuration or null if not found.
 */
function findAndParseIonapi(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return null;

    const files = fs.readdirSync(dirPath);
    const ionapiFile = files.find(file => file.endsWith('.ionapi'));

    if (ionapiFile) {
      const filePath = path.join(dirPath, ionapiFile);
      console.log(`[IONAPI] Found config file at: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`[IONAPI] Error reading .ionapi from ${dirPath}:`, err.message);
  }
  return null;
}

/**
 * Retrieves the parsed .ionapi configuration.
 * Scans the backend root and the parent workspace root.
 * Caches the config in memory.
 */
function getIonapiConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  // 1. Search in the backend project root (buyer-selection-api)
  const backendRoot = path.resolve(__dirname, '../../');
  let config = findAndParseIonapi(backendRoot);

  // 2. Search in the parent directory (c:\Roshan\CrossLine)
  if (!config) {
    const parentRoot = path.resolve(backendRoot, '../');
    config = findAndParseIonapi(parentRoot);
  }

  if (config) {
    cachedConfig = config;
    return cachedConfig;
  }

  // 3. Fallback to default/environment configurations if no file is found
  console.warn('[IONAPI] No .ionapi file found. Using default environment configuration.');
  return {
    ti: process.env.INFOR_TI,
    iu: process.env.INFOR_IU,
  };
}

module.exports = {
  getIonapiConfig
};
