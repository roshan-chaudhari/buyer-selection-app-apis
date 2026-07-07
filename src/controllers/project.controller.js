const { projectService, itemService } = require('../services');
const { asyncHandler } = require('../utils/asyncHandler');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses and validates a route param as a positive integer.
 * Returns the integer or null if invalid.
 */
function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ── Controller ───────────────────────────────────────────────────────────────

const getAllProjects = asyncHandler(async (req, res) => {
  const projects = await projectService.getAllProjects();
  return res.ok('Projects fetched successfully', projects);
});

const getProjectById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.fail('Invalid project ID', 400);

  const project = await projectService.getProjectById(id);
  if (!project) return res.fail(`Project with ID ${id} not found`, 404);
  return res.ok('Project fetched successfully', project);
});

const createProject = asyncHandler(async (req, res) => {
  const { 
    projectName, 
    section, 
    buyerId,
    buyerName, 
    description, 
    selectionDate, 
    items, 
    userId, 
    userName,
    plmProjectName,
    plmBuyerField,
    plmSelectionDate,
    plmLastModified
  } = req.body;

  if (!projectName) {
    return res.fail('Project name (projectName) is required', 400);
  }

  // Check for duplicate project name
  const existingProject = await projectService.getProjectByName(projectName);
  if (existingProject) {
    return res.fail(`Project with name "${projectName}" already exists`, 400);
  }

  const projectId = await projectService.createProject({
    projectName,
    section,
    buyerId,
    buyerName,
    description,
    selectionDate,
    items,
    userId,
    userName,
    plmProjectName,
    plmBuyerField,
    plmSelectionDate,
    plmLastModified,
  });

  const newProject = await projectService.getProjectById(projectId);
  return res.created('Project created successfully', newProject);
});

const updateProject = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.fail('Invalid project ID', 400);

  const { 
    projectName, 
    section, 
    buyerId,
    buyerName, 
    description, 
    selectionDate, 
    items, 
    userId, 
    userName,
    plmProjectName,
    plmBuyerField,
    plmSelectionDate,
    plmLastModified
  } = req.body;

  if (!projectName || !section) {
    return res.fail('projectName and section fields are required', 400);
  }

  const updatedId = await projectService.updateProject(id, {
    projectName,
    section,
    buyerId,
    buyerName,
    description,
    selectionDate,
    items,
    userId,
    userName,
    plmProjectName,
    plmBuyerField,
    plmSelectionDate,
    plmLastModified,
  });

  if (!updatedId) return res.fail(`Project with ID ${id} not found`, 404);

  const updatedProject = await projectService.getProjectById(id);
  return res.ok('Project updated successfully', updatedProject);
});

const deleteProject = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.fail('Invalid project ID', 400);

  const { userId, userName } = req.query;

  const success = await projectService.deleteProject(id, userId, userName);
  if (!success) return res.fail(`Project with ID ${id} not found`, 404);

  return res.ok('Project deleted successfully');
});

// ── Item Endpoints ─────────────────────────────────────────────────────────

const getItemsForProject = asyncHandler(async (req, res) => {
  const projectId = parseId(req.params.projectId);
  if (!projectId) return res.fail('Invalid project ID', 400);

  const projectExists = await projectService.projectExists(projectId);
  if (!projectExists) return res.fail(`Project with ID ${projectId} not found`, 404);

  const items = await itemService.getItemsByProjectId(projectId);
  return res.ok('Items fetched successfully', items);
});

const addItemToProject = asyncHandler(async (req, res) => {
  const projectId = parseId(req.params.projectId);
  if (!projectId) return res.fail('Invalid project ID', 400);

  const itemData = req.body;

  const insertedItem = await itemService.addItemToProject(projectId, itemData);
  if (!insertedItem) return res.fail(`Project with ID ${projectId} not found`, 404);

  return res.created('Item added successfully', insertedItem);
});

const updateProjectItem = asyncHandler(async (req, res) => {
  const itemId = parseId(req.params.itemId);
  if (!itemId) return res.fail('Invalid item ID', 400);

  const itemData = req.body;

  const updatedItem = await itemService.updateItem(itemId, itemData);
  if (!updatedItem) return res.fail(`Item with ID ${itemId} not found`, 404);

  return res.ok('Item updated successfully', updatedItem);
});

const deleteProjectItem = asyncHandler(async (req, res) => {
  const itemId = parseId(req.params.itemId);
  if (!itemId) return res.fail('Invalid item ID', 400);

  const success = await itemService.deleteItem(itemId);
  if (!success) return res.fail(`Item with ID ${itemId} not found`, 404);

  return res.ok('Item deleted successfully');
});

const proxyImage = asyncHandler(async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.fail('URL is required', 400);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.fail(`Failed to fetch image from S3: ${response.statusText}`, response.status);
    }
    const arrayBuffer = await response.arrayBuffer();
    let contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Override octet-stream content-type to actual image mime-types
    if (contentType === 'application/octet-stream' || contentType === 'binary/octet-stream') {
      try {
        const pathname = new URL(imageUrl).pathname;
        if (pathname.toLowerCase().endsWith('.png')) {
          contentType = 'image/png';
        } else if (pathname.toLowerCase().endsWith('.gif')) {
          contentType = 'image/gif';
        } else if (pathname.toLowerCase().endsWith('.svg')) {
          contentType = 'image/svg+xml';
        } else {
          contentType = 'image/jpeg';
        }
      } catch (e) {
        contentType = 'image/jpeg';
      }
    }

    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;
    return res.ok('Image proxied successfully', { dataUrl });
  } catch (err) {
    console.error('Failed to proxy image:', err.message);
    return res.fail(`Failed to load image: ${err.message}`, 500);
  }
});

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getItemsForProject,
  addItemToProject,
  updateProjectItem,
  deleteProjectItem,
  proxyImage,
};
