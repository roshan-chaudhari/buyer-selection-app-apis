const projectService = require('./project.service');
const itemService = require('./item.service');

// Combine both sub-services for backward compatibility in existing controllers
const buyerProjectService = {
  // Project-related methods
  getAllProjects: projectService.getAllProjects.bind(projectService),
  getProjectById: projectService.getProjectById.bind(projectService),
  getProjectByName: projectService.getProjectByName.bind(projectService),
  createProject: projectService.createProject.bind(projectService),
  updateProject: projectService.updateProject.bind(projectService),
  projectExists: projectService.projectExists.bind(projectService),
  deleteProject: projectService.deleteProject.bind(projectService),
  
  // Item-related methods
  getItemsByProjectId: itemService.getItemsByProjectId.bind(itemService),
  addItemToProject: itemService.addItemToProject.bind(itemService),
  updateItem: itemService.updateItem.bind(itemService),
  deleteItem: itemService.deleteItem.bind(itemService),
};

module.exports = {
  buyerProjectService,
  projectService,
  itemService
};
