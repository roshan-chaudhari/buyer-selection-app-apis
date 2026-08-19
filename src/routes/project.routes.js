const { Router } = require('express');
const projectController = require('../controllers/project.controller');
const { upload } = require('../middleware/upload');

const router = Router();

// ── Static sub-paths FIRST (must come before dynamic /:id) ──
// UPDATE an item by ID
router.put('/items/:itemId', projectController.updateProjectItem);

// DELETE an item by ID
router.delete('/items/:itemId', projectController.deleteProjectItem);

// S3 Image upload endpoint (accepts multipart/form-data or json)
router.post('/upload-image', upload.single('image'), projectController.uploadImage);

// S3 Image retrieval endpoint
router.get('/s3-image', projectController.getS3Image);

// S3 Image single delete endpoint
router.delete('/s3-image', projectController.deleteS3Image);
router.post('/delete-image', projectController.deleteS3Image);

// S3 Style folder batch delete endpoint (when a style is deleted from project)
router.delete('/style-images', projectController.deleteStyleImages);
router.post('/delete-style-images', projectController.deleteStyleImages);

// PROXY image request
router.get('/proxy-image', projectController.proxyImage);

// ── Project routes ──
// GET all buyer projects
router.get('/', projectController.getAllProjects);

// CREATE a new project
router.post('/', projectController.createProject);

// GET project by ID
router.get('/:id', projectController.getProjectById);

// UPDATE project by ID
router.put('/:id', projectController.updateProject);

// LOCK project by ID (makes it read-only for all users)
router.patch('/:id/lock', projectController.lockProject);

// DELETE project by ID
router.delete('/:id', projectController.deleteProject);

// GET all items for a project
router.get('/:projectId/items', projectController.getItemsForProject);

// ADD a single item to a project
router.post('/:projectId/items', projectController.addItemToProject);

module.exports = router;
