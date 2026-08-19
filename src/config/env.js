const path = require('path');
const dotenv = require('dotenv');

// Always resolve relative to the buyer-selection-api root directory
const rootDir = path.resolve(__dirname, '../../');

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(rootDir, envFile) });
dotenv.config({ path: path.resolve(rootDir, '.env') });
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();
