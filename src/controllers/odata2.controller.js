const fs = require('fs');
const path = require('path');
const { getIonapiConfig } = require('../config');
const { asyncHandler } = require('../utils/asyncHandler');

const proxyRequest = asyncHandler(async (req, res) => {
  const config = getIonapiConfig();
  if (!config) {
    return res.status(500).json({
      success: false,
      message: 'ION API configuration not found on the backend. Please verify your .ionapi file.'
    });
  }

  const ti = req.headers['x-tenant-id'] || config.ti || '';
  // Normalize base domain by removing trailing slash if present
  const iuBase = (req.headers['x-infor-url'] || config.iu || 'https://mingle-ionapi.eu1.inforcloudsuite.com').replace(/\/$/, '');
  // Infor API unit (e.g. FASHIONPLM)
  const iuUnit = 'FASHIONPLM';

  // Construct the complete base URL
  const baseUrl = `${iuBase}/${ti}/${iuUnit}/odata2`;

  // Append the original request path (including query parameters)
  // For view/entity/data/get and other service actions under api/, route without double-nesting /odata2
  let finalUrl;
  if (req.originalUrl.includes('view/')) {
    const odataIndex = req.originalUrl.indexOf('/odata2/');
    const pathAfterOData = odataIndex !== -1 ? req.originalUrl.substring(odataIndex + 8) : req.originalUrl;
    finalUrl = `${iuBase}/${ti}/${iuUnit}/odata2/api/${pathAfterOData}`;
  } else if (req.originalUrl.includes('/job/')) {
    const jobIndex = req.originalUrl.indexOf('/job/');
    const pathAfterJob = jobIndex !== -1 ? req.originalUrl.substring(jobIndex) : '/job/tasks';
    finalUrl = `${iuBase}/${ti}/${iuUnit}/job/api${pathAfterJob}`;
  } else if (req.originalUrl.includes('/library/')) {
    // PLM library service — real URL: {iuBase}/{ti}/FASHIONPLM/library/api/library/tools/idgenerator/get
    // Frontend calls: /api/library/tools/idgenerator/get (after Express strips /api prefix)
    // req.originalUrl here is e.g. /api/library/tools/idgenerator/get
    const libIndex = req.originalUrl.indexOf('/library/');
    const pathAfterLib = libIndex !== -1 ? req.originalUrl.substring(libIndex + 9) : 'tools/idgenerator/get';
    finalUrl = `${iuBase}/${ti}/${iuUnit}/library/api/library/${pathAfterLib}`;
  } else if (req.originalUrl.includes('/pdm/')) {
    const pdmIndex = req.originalUrl.indexOf('/pdm/');
    const pathAfterPdm = pdmIndex !== -1 ? req.originalUrl.substring(pdmIndex) : '/pdm/style/colorways/save';
    finalUrl = `${iuBase}/${ti}/${iuUnit}/pdm/api${pathAfterPdm}`;
  } else if (req.originalUrl.includes('/document')) {
    const docIndex = req.originalUrl.indexOf('/document');
    const pathAfterDoc = docIndex !== -1 ? req.originalUrl.substring(docIndex) : '/document/UploadFile/';
    finalUrl = `${iuBase}/${ti}/${iuUnit}/documents/api${pathAfterDoc}`;
  } else {
    // e.g. /api/odata2/GenericLookUpAll -> https://.../odata2/api/odata2/GenericLookUpAll
    finalUrl = `${baseUrl}${req.originalUrl}`;
  }

  console.log(`[PROXY] Routing ${req.method} ${req.originalUrl} --> ${finalUrl}`);


  // Build headers to forward
  const headers = {};
  for (const key of Object.keys(req.headers)) {
    const lowerKey = key.toLowerCase();
    // Skip connection, content, origin, referer, routing headers, and browser-specific security headers
    if (
      ['host', 'connection', 'content-length', 'content-type', 'origin', 'referer', 'x-tenant-id', 'x-infor-url'].includes(lowerKey) ||
      lowerKey.startsWith('sec-')
    ) {
      continue;
    }
    headers[key] = req.headers[key];
  }

  // Explicitly copy content-type if present
  if (req.headers['content-type']) {
    headers['content-type'] = req.headers['content-type'];
  }

  let tempFilePath = null;
  if (req.originalUrl.includes('/document') && req.method === 'POST' && req.body && req.body.objectStream) {
    try {
      const rawBase64 = req.body.objectStream;
      const originalObjectName = req.body.originalObjectName || 'style_image.jpg';
      const buffer = Buffer.from(rawBase64, 'base64');

      const tempDir = path.join(__dirname, '../temp-uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      tempFilePath = path.join(tempDir, originalObjectName);
      fs.writeFileSync(tempFilePath, buffer);
      console.log(`[PROXY] Converted base64 image and stored in folder: ${tempFilePath}`);

      // Read it back from the folder
      const storedData = fs.readFileSync(tempFilePath);
      const base64FromFolder = storedData.toString('base64');

      // Update the request body with the data taken from the folder
      req.body.objectStream = base64FromFolder;
      console.log(`[PROXY] Successfully retrieved image from folder to send to PLM.`);
    } catch (saveErr) {
      console.error('[PROXY] Failed to store/retrieve image from folder:', saveErr);
    }
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers: headers
    };

    // Forward request body for mutation requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
      fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
      console.log(`[PROXY] Forwarding Body:`, fetchOptions.body);
    }

    //console.log(`[ODATA2 PROXY] Forwarding Headers:`, JSON.stringify(headers));
    const response = await fetch(finalUrl, fetchOptions);
    const data = await response.text();

    // console.log(`[PROXY] Response Status: ${response.status}`);
    // console.log(`[PROXY] Response Body:`, data);

    // Forward response status and headers back to frontend
    res.status(response.status);

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    return res.send(data);
  } catch (error) {
    console.error('[PROXY] Request failed:', error);
    return res.status(500).json({
      success: false,
      message: `OData2 Proxy failed: ${error.message}`
    });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`[PROXY] Cleaned up temporary image file: ${tempFilePath}`);
      } catch (cleanupErr) {
        console.error('[PROXY] Failed to clean up temporary file:', cleanupErr);
      }
    }
  }
});

module.exports = { proxyRequest };
