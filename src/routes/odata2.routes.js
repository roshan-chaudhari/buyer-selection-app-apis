const { Router } = require('express');
const odata2Controller = require('../controllers/odata2.controller');

const router = Router();

// Catch-all route using middleware mount to forward all methods and paths to the proxy controller
router.use(odata2Controller.proxyRequest);

module.exports = router;
