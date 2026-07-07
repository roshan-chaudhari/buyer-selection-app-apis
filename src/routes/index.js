const express = require('express');
const projectRoutes = require('./project.routes');
const odata2Routes = require('./odata2.routes');

const router = express.Router();

// Register routes
router.use('/projects', projectRoutes);
router.use('/odata2', odata2Routes);

module.exports = router;
