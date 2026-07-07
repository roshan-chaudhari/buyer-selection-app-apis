const { Router } = require('express');
const projectController = require('../controllers/project.controller');

const router = Router();

// ── Static sub-paths FIRST (must come before dynamic /:id) ──────────────────
// UPDATE an item by ID
router.put('/items/:itemId', projectController.updateProjectItem);

// DELETE an item by ID
router.delete('/items/:itemId', projectController.deleteProjectItem);

// ── Project routes ───────────────────────────────────────────────────────────
// GET all buyer projects
router.get('/', projectController.getAllProjects);

// PROXY image request
router.get('/proxy-image', projectController.proxyImage);

// CREATE a new project
router.post('/', projectController.createProject);

// GET project by ID
router.get('/:id', projectController.getProjectById);

// UPDATE project by ID
router.put('/:id', projectController.updateProject);

// DELETE project by ID
router.delete('/:id', projectController.deleteProject);

// GET all items for a project
router.get('/:projectId/items', projectController.getItemsForProject);

// ADD a single item to a project
router.post('/:projectId/items', projectController.addItemToProject);

module.exports = router;
