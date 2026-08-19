const { projectService, itemService, s3Service } = require('../services');
const { asyncHandler } = require('../utils/asyncHandler');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parses and validates a route param as a positive integer.
 * Returns the integer or null if invalid.
 */
function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ── Controller ────────────────────────────────────────────────────────────────

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

const lockProject = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.fail('Invalid project ID', 400);

  const success = await projectService.lockProject(id);
  if (!success) return res.fail(`Project with ID ${id} not found`, 404);

  const updatedProject = await projectService.getProjectById(id);
  return res.ok('Project locked successfully', updatedProject);
});

// ── Item Endpoints ────────────────────────────────────────────────────────────

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

  const locked = await projectService.isProjectLocked(projectId);
  if (locked) return res.fail('This project is locked and cannot be modified', 403);

  const itemData = req.body;

  const insertedItem = await itemService.addItemToProject(projectId, itemData);
  if (!insertedItem) return res.fail(`Project with ID ${projectId} not found`, 404);

  return res.created('Item added successfully', insertedItem);
});

const updateProjectItem = asyncHandler(async (req, res) => {
  const itemId = parseId(req.params.itemId);
  if (!itemId) return res.fail('Invalid item ID', 400);

  const itemData = req.body;

  // Guard: check if the parent project is locked
  const existingItem = await itemService.getItemById(itemId);
  if (existingItem) {
    const locked = await projectService.isProjectLocked(existingItem.projectId);
    if (locked) return res.fail('This project is locked and cannot be modified', 403);
  }

  const updatedItem = await itemService.updateItem(itemId, itemData);
  if (!updatedItem) return res.fail(`Item with ID ${itemId} not found`, 404);

  return res.ok('Item updated successfully', updatedItem);
});

const deleteProjectItem = asyncHandler(async (req, res) => {
  const itemId = parseId(req.params.itemId);
  if (!itemId) return res.fail('Invalid item ID', 400);

  // Guard: check if the parent project is locked
  const existingItem = await itemService.getItemById(itemId);
  if (existingItem) {
    const locked = await projectService.isProjectLocked(existingItem.projectId);
    if (locked) return res.fail('This project is locked and cannot be modified', 403);
  }

  const success = await itemService.deleteItem(itemId);
  if (!success) return res.fail(`Item with ID ${itemId} not found`, 404);

  return res.ok('Item deleted successfully');
});

// ── S3 Image Upload & Retrieval & Delete Endpoints ─────────────────────────────

const uploadImage = asyncHandler(async (req, res) => {
  const { projectName, styleName, fileName, base64Data, itemId } = req.body;
  let fileBuffer = null;
  let mimeType = 'image/jpeg';
  let targetFileName = fileName;

  if (req.file) {
    fileBuffer = req.file.buffer;
    mimeType = req.file.mimetype || 'image/jpeg';
    if (!targetFileName) {
      targetFileName = req.file.originalname;
    }
  } else if (base64Data) {
    // If base64Data is already an S3 URL, return it without re-uploading
    if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
      return res.ok('Image already stored in S3', { url: base64Data, key: s3Service.extractKeyFromUrl(base64Data) });
    }

    let cleanBase64 = base64Data;
    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        cleanBase64 = match[2];
      } else {
        cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      }
    }
    fileBuffer = Buffer.from(cleanBase64, 'base64');
  } else {
    return res.fail('No image file or base64Data provided', 400);
  }

  const result = await s3Service.uploadImageToS3({
    buffer: fileBuffer,
    mimeType,
    projectName: projectName || 'General',
    styleName: styleName || 'Style',
    fileName: targetFileName,
  });

  // If itemId was provided, update the item's AnnotatedImage in database
  if (itemId) {
    const parsedItemId = parseId(itemId);
    if (parsedItemId) {
      const item = await itemService.getItemById(parsedItemId);
      if (item) {
        await itemService.updateItem(parsedItemId, {
          annotatedImage: JSON.stringify([result.url]),
        });
      }
    }
  }

  return res.ok('Image uploaded to S3 successfully', result);
});

const getS3Image = asyncHandler(async (req, res) => {
  const { key, url } = req.query;
  let targetKey = key || url;

  if (!targetKey) {
    return res.status(400).send('Image key or url is required');
  }

  try {
    const { buffer, contentType, base64 } = await s3Service.getImageFromS3(targetKey);
    if (req.query.format === 'base64') {
      return res.ok('Image retrieved successfully', { base64, contentType, key: targetKey });
    }
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(buffer);
  } catch (err) {
    console.error('[getS3Image] Failed to retrieve image from S3:', err.message);
    if (url && url.startsWith('http')) {
      try {
        const fetchRes = await fetch(url);
        if (fetchRes.ok) {
          const ab = await fetchRes.arrayBuffer();
          res.setHeader('Content-Type', fetchRes.headers.get('content-type') || 'image/jpeg');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.send(Buffer.from(ab));
        }
      } catch (proxyErr) {}
    }
    return res.status(500).send(`Failed to retrieve image: ${err.message}`);
  }
});

const deleteS3Image = asyncHandler(async (req, res) => {
  const keyOrUrl = req.query.key || req.query.url || req.body?.key || req.body?.url;
  if (!keyOrUrl) {
    return res.fail('Image key or url is required for deletion', 400);
  }

  const success = await s3Service.deleteImageFromS3(keyOrUrl);
  return res.ok('Image deleted from S3 successfully', { success, keyOrUrl });
});

const deleteStyleImages = asyncHandler(async (req, res) => {
  const projectName = req.query.projectName || req.body?.projectName;
  const styleName = req.query.styleName || req.body?.styleName;

  if (!projectName || !styleName) {
    return res.fail('projectName and styleName are required to delete style images', 400);
  }

  const success = await s3Service.deleteStyleFolderFromS3(projectName, styleName);
  return res.ok(`All images for style "${styleName}" under project "${projectName}" deleted successfully`, { success });
});

const proxyImage = asyncHandler(async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('URL is required');

  // If this is an AWS S3 URL, fetch it using AWS SDK credentials via s3Service
  if (
    imageUrl.includes('amazonaws.com') ||
    imageUrl.includes('buyerapp-image') ||
    (process.env.AWS_S3_BUCKET && imageUrl.includes(process.env.AWS_S3_BUCKET)) ||
    (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))
  ) {
    try {
      const { buffer, contentType } = await s3Service.getImageFromS3(imageUrl);
      res.setHeader('Content-Type', contentType || 'image/jpeg');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    } catch (s3Err) {
      console.warn('[proxyImage] S3 fetch via SDK failed, falling back to fetch:', s3Err.message);
    }
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
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
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(buffer);
  } catch (err) {
    console.error('Failed to proxy image:', err.message);
    return res.status(500).send(`Failed to load image: ${err.message}`);
  }
});

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  lockProject,
  getItemsForProject,
  addItemToProject,
  updateProjectItem,
  deleteProjectItem,
  uploadImage,
  getS3Image,
  deleteS3Image,
  deleteStyleImages,
  proxyImage,
};
