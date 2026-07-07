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

  const ti = config.ti || '';
  // Normalize base domain by removing trailing slash if present
  const iuBase = (config.iu || 'https://mingle-ionapi.eu1.inforcloudsuite.com').replace(/\/$/, '');
  // Infor API unit (e.g. FASHIONPLM)
  const iuUnit = 'FASHIONPLM'; 

  // Construct the complete base URL
  // e.g. https://mingle-ionapi.eu1.inforcloudsuite.com/PTEXSOLUTIONS_DEM/FASHIONPLM/odata2
  const baseUrl = `${iuBase}/${ti}/${iuUnit}/odata2`;

  // Append the original request path (including query parameters)
  // For view/entity/data/get and other service actions under api/, route without double-nesting /odata2
  let finalUrl;
  if (req.originalUrl.includes('view/entity/data/get')) {
    const odataIndex = req.originalUrl.indexOf('/odata2/');
    const pathAfterOData = odataIndex !== -1 ? req.originalUrl.substring(odataIndex + 8) : 'view/entity/data/get';
    finalUrl = `${iuBase}/${ti}/${iuUnit}/odata2/api/${pathAfterOData}`;
  } else {
    // e.g. /api/odata2/GenericLookUpAll -> https://.../odata2/api/odata2/GenericLookUpAll
    finalUrl = `${baseUrl}${req.originalUrl}`;
  }

  //console.log(`[ODATA2 PROXY] Routing ${req.method} request to: ${finalUrl}`);

  // Build headers to forward
  const headers = {};
  for (const key of Object.keys(req.headers)) {
    const lowerKey = key.toLowerCase();
    // Skip connection, content, origin, referer, and browser-specific security headers
    if (
      ['host', 'connection', 'content-length', 'content-type', 'origin', 'referer'].includes(lowerKey) ||
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

  try {
    const fetchOptions = {
      method: req.method,
      headers: headers
    };

    // Forward request body for mutation requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
      fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
      //console.log(`[ODATA2 PROXY] Forwarding Request Body:`, fetchOptions.body);
    }

    //console.log(`[ODATA2 PROXY] Forwarding Headers:`, JSON.stringify(headers));
    const response = await fetch(finalUrl, fetchOptions);
    const data = await response.text();

    //console.log(`[ODATA2 PROXY] Response Status: ${response.status}`);
    // console.log(`[ODATA2 PROXY] Response Payload:`, data);

    // Forward response status and headers back to frontend
    res.status(response.status);

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    return res.send(data);
  } catch (error) {
    //console.error('[ODATA2 PROXY] Request failed:', error);
    return res.status(500).json({
      success: false,
      message: `OData2 Proxy failed: ${error.message}`
    });
  }
});

module.exports = { proxyRequest };
