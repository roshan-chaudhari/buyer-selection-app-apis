const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { requestLogger } = require('./middleware/requestLogger');
const { responseHandler } = require('./middleware/responseHandler');
const { errorHandler } = require('./middleware/errorHandler');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS — restrict to known frontend origin (loaded from environment)
// app.use(cors({
//   origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
// }));


app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://buyersectionapp-bkcrhth7fye0b9et.centralindia-01.azurewebsites.net"
  ],
  credentials: true,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-target-url",
    "x-infor-url",
    "x-infor-user",
    "x-tenant-id",
    "x-infor-tenantid",
    "x-fplm-schema",
    "x-fplm-client-version"
  ]
}));

// Body parsing middleware — limit raised to 20 MB to support Base64-encoded annotated images
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Log all incoming requests
app.use(requestLogger);

// Attach res.ok / res.created / res.fail to every response
app.use(responseHandler);

// Dynamic CORS Proxy endpoint to mirror Vite's dev-server proxy in production
// app.all('/cors-proxy/*splat', async (req, res) => {
//   const targetUrl = req.headers['x-target-url'];
//   if (!targetUrl) {
//     return res.status(400).send('Missing x-target-url header');
//   }

//   try {
//     const headers = {};
//     for (const [key, value] of Object.entries(req.headers)) {
//       if (!['host', 'x-target-url', 'connection', 'origin', 'referer'].includes(key.toLowerCase())) {
//         headers[key] = value;
//       }
//     }

//     const fetchOptions = {
//       method: req.method,
//       headers: headers,
//     };

//     if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
//       fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
//     }

//     console.log(`[CORS PROXY] Routing ${req.method} --> ${targetUrl}`);
//     const response = await fetch(targetUrl, fetchOptions);
//     const contentType = response.headers.get('content-type');
//     const status = response.status;

//     const buffer = await response.arrayBuffer();
    
//     if (contentType) {
//       res.setHeader('content-type', contentType);
//     }
//     res.status(status).send(Buffer.from(buffer));
//   } catch (err) {
//     console.error('[CORS PROXY ERROR]:', err.message);
//     res.status(500).send(`CORS proxy failed: ${err.message}`);
//   }
// });

app.all('/cors-proxy/*', async (req, res) => {
  try {
    let targetUrl = req.headers['x-target-url'];

    // If no header is provided, build the target URL from the path
    if (!targetUrl) {
      const path = req.originalUrl.replace('/cors-proxy', '');
      targetUrl = process.env.INFOR_BASE_URL + path;
    }

    const headers = { ...req.headers };

    delete headers.host;
    delete headers.origin;
    delete headers.referer;
    delete headers.connection;
    delete headers['x-target-url'];
    delete headers['content-length'];

    const options = {
      method: req.method,
      headers
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body =
        headers['content-type']?.includes('application/x-www-form-urlencoded')
          ? new URLSearchParams(req.body).toString()
          : JSON.stringify(req.body);
    }

    console.log("Proxying:", targetUrl);

    const response = await fetch(targetUrl, options);

    res.status(response.status);

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    res.send(buffer);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.get('/health', (req, res) => {
  res.ok('ok');
})
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
