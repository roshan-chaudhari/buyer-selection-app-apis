const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { requestLogger } = require('./middleware/requestLogger');
const { responseHandler } = require('./middleware/responseHandler');
const { errorHandler } = require('./middleware/errorHandler');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS — restrict to known frontend origin
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing middleware — limit raised to 20 MB to support Base64-encoded annotated images
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Log all incoming requests
app.use(requestLogger);

// Attach res.ok / res.created / res.fail to every response
app.use(responseHandler);

// Mount combined API routes
const apiRoutes = require('./routes');
app.use('/api', apiRoutes);

// Catch-all route for 404
app.use((req, res) => {
  res.fail('Route not found', 404);
});

// Global error handler — must be LAST
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
