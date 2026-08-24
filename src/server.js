const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('./config/env');

const { requestLogger } = require('./middleware/requestLogger');
const { responseHandler } = require('./middleware/responseHandler');
const { errorHandler } = require('./middleware/errorHandler');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : [
    "http://localhost:5173",
    "https://buyersectionapp-bkcrhth7fye0b9et.centralindia-01.azurewebsites.net"
  ];

app.use(cors(
  {
    //origin: (origin, callback) => callback(null, origin || true),
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
  }
));

// Body parsing middleware � limit raised to 20 MB to support Base64-encoded annotated images
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Log all incoming requests
app.use(requestLogger);

// Attach res.ok / res.created / res.fail to every response
app.use(responseHandler);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.all(['/cors-proxy', '/cors-proxy/*'], upload.any(), async (req, res) => {
  console.log("BACKEND CORS PROXY HIT:", req.method, req.originalUrl);
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

    let options = {
      method: req.method,
      headers
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.files && req.files.length > 0) {
        const form = new FormData();
        for (const [key, val] of Object.entries(req.body || {})) {
          form.append(key, val);
        }
        for (const file of req.files) {
          let mimetype = file.mimetype;
          if (!mimetype || mimetype === 'application/octet-stream') {
            const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
            mimetype = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          }
          const blob = new Blob([file.buffer], { type: mimetype });
          form.append(file.fieldname, blob, file.originalname);
        }
        delete headers['content-type'];
        options.body = form;
      } else if (headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        options.body = new URLSearchParams(req.body).toString();
      } else {
        options.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
      }
    }

    console.log("Proxying:", targetUrl);

    const response = await fetch(targetUrl, options);

    res.status(response.status);

    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'content-length') {
        res.setHeader(key, value);
      }
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
});

// Mount combined API routes
const apiRoutes = require('./routes');
app.use('/api', apiRoutes);

// Catch-all route for 404
app.use((req, res) => {
  res.fail('Route not found', 404);
});

// Global error handler � must be LAST
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
// restart
