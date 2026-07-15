const { db } = require('../config');

function toDbSection(section) {
  if (section === 'Syncro PLM' || section === 'SYNCRO PLM Project') {
    return 'SYNCRO PLM Project';
  }
  return 'Draft Project';
}

function fromDbSection(projectType) {
  if (projectType === 'SYNCRO PLM Project') {
    return 'Syncro PLM';
  }
  return 'Draft';
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function mapItemRow(item) {
  return {
    id: item.Id,
    projectId: item.ProjectId,
    styleId: item.StyleId || 0,
    colorId: item.ColorId || 0,
    colorStatusId: item.ColorStatusId || 0,
    styleMaterialNumber: item.StyleMaterialNumber || '',
    styleMaterialName: item.StyleMaterialName || '',
    colorway: item.Colorway || '',
    colorwayStatus: item.ColorwayStatus || '',
    selectionCondition: item.SelectionCondition || '',
    sampleDue: item.SampleDue,
    buyerComments: item.BuyerComments || '',
    internalComments: item.InternalComments || '',
    annotatedImage: item.AnnotatedImage || null,
    createdDate: item.CreatedDate
  };
}

function mapProjectRow(r, items = []) {
  return {
    id: r.Id,
    projectName: r.ProjectName,
    section: r.IsLocked === 1 ? 'Syncro PLM' : fromDbSection(r.ProjectType),
    isLocked: r.IsLocked === 1,
    buyerId: r.BuyerId || null,
    buyerName: r.BuyerName,
    description: r.Description || '',
    selectionDate: r.SelectionDate,
    itemsCount: r.Items,
    userId: r.UserId,
    userName: r.UserName,
    lastUpdated: r.LastUpdated,
    plmProjectName: r.PlmProjectName || '',
    plmBuyerField: r.PlmBuyerField || '',
    plmSelectionDate: r.PlmSelectionDate,
    plmLastModified: r.PlmLastModified,
    createdDate: r.CreatedDate,
    items
  };
}

module.exports = {
  db,
  toDbSection,
  fromDbSection,
  parseDate,
  mapItemRow,
  mapProjectRow
};
