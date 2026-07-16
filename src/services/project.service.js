const { db, toDbSection, parseDate, mapProjectRow, mapItemRow } = require('./common');

class ProjectService {
  async getAllProjects() {
    const query = `
      SELECT Id, ProjectType, IsLocked, ProjectName, BuyerId, BuyerName, Description, SelectionDate, Items, UserId, UserName, LastUpdated, PlmProjectName, PlmBuyerField, PlmSelectionDate, PlmLastModified, CreatedDate
      FROM buyerprojects 
      WHERE IsDelete = 0
      ORDER BY LastUpdated DESC;
    `;
    const [rows] = await db.query(query);
    if (rows.length === 0) return [];

    return rows.map(r => mapProjectRow(r));
  }

  async getProjectById(id) {
    const query = `
      SELECT Id, ProjectType, IsLocked, ProjectName, BuyerName, Description, SelectionDate, Items, UserId, UserName, LastUpdated, PlmProjectName, PlmBuyerField, PlmSelectionDate, PlmLastModified, CreatedDate
      FROM buyerprojects 
      WHERE Id = ? AND IsDelete = 0;
    `;
    const [rows] = await db.query(query, [id]);
    if (rows.length === 0) return null;
    const r = rows[0];

    const [itemRows] = await db.query(
      `SELECT Id, ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, ItemType, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, AnnotatedImage, CreatedDate 
       FROM buyerprojectitems 
       WHERE ProjectId = ?`,
      [id]
    );

    const items = itemRows.map(mapItemRow);
    return mapProjectRow(r, items);
  }

  async getProjectByName(projectName) {
    const query = `
      SELECT Id, ProjectType, IsLocked, ProjectName, BuyerName, Description, SelectionDate, Items, UserId, UserName, LastUpdated, PlmProjectName, PlmBuyerField, PlmSelectionDate, PlmLastModified, CreatedDate
      FROM buyerprojects 
      WHERE ProjectName = ? AND IsDelete = 0;
    `;
    const [rows] = await db.query(query, [projectName]);
    if (rows.length > 0) return mapProjectRow(rows[0]);
    return null;
  }

  async createProject(projectData) {
    const { 
      projectName, 
      section, 
      buyerId,
      buyerName, 
      description, 
      selectionDate, 
      items = [], 
      userId, 
      userName,
      plmProjectName,
      plmBuyerField,
      plmSelectionDate,
      plmLastModified
    } = projectData;
    const dbSection = toDbSection(section);
    const uniqueStyles = Array.isArray(items)
      ? new Set(items.map(item => item.styleMaterialNumber).filter(Boolean))
      : new Set();
    const itemsCount = Array.isArray(items) ? uniqueStyles.size : (typeof items === 'number' ? items : 0);

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO buyerprojects 
         (ProjectType, ProjectName, BuyerId, BuyerName, Description, SelectionDate, Items, UserId, UserName, PlmProjectName, PlmBuyerField, PlmSelectionDate, PlmLastModified, LastUpdated, CreatedDate) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          dbSection,
          projectName,
          buyerId || null,
          buyerName || '',
          description || '',
          parseDate(selectionDate),
          itemsCount,
          userId || null,
          userName || 'System User',
          plmProjectName || null,
          plmBuyerField || null,
          parseDate(plmSelectionDate),
          parseDate(plmLastModified)
        ]
      );

      const projectId = result.insertId;

      if (itemsCount > 0) {
        const itemInsertQuery = `
          INSERT INTO buyerprojectitems 
          (ProjectId, StyleMaterialNumber, StyleMaterialName, ItemType, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, AnnotatedImage) 
          VALUES ?
        `;
        const itemValues = items.map(item => [
          projectId,
          item.styleMaterialNumber || null,
          item.styleMaterialName || null,
          item.itemType || 'Style',
          item.colorway || null,
          item.colorwayStatus || null,
          item.selectionCondition || null,
          parseDate(item.sampleDue),
          item.buyerComments || null,
          item.internalComments || null,
          item.annotatedImage || null
        ]);
        await connection.query(itemInsertQuery, [itemValues]);
      }

      await connection.commit();
      return projectId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateProject(id, projectData) {
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
    } = projectData;
    const dbSection = toDbSection(section);

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [projectRows] = await connection.query(
        'SELECT Id FROM buyerprojects WHERE Id = ? AND IsDelete = 0',
        [id]
      );
      if (projectRows.length === 0) {
        await connection.rollback();
        return null;
      }

      await connection.query(
        `UPDATE buyerprojects 
         SET ProjectType = ?, ProjectName = ?, BuyerId = ?, BuyerName = ?, Description = ?, SelectionDate = ?, UserId = ?, UserName = ?, PlmProjectName = ?, PlmBuyerField = ?, PlmSelectionDate = ?, PlmLastModified = ?, LastUpdated = CURRENT_TIMESTAMP 
         WHERE Id = ? AND IsDelete = 0`,
        [
          dbSection,
          projectName,
          buyerId || null,
          buyerName || '',
          description || '',
          parseDate(selectionDate),
          userId || null,
          userName || 'System User',
          plmProjectName || null,
          plmBuyerField || null,
          parseDate(plmSelectionDate),
          parseDate(plmLastModified),
          id
        ]
      );

      if (Array.isArray(items)) {
        await connection.query('DELETE FROM buyerprojectitems WHERE ProjectId = ?', [id]);

        if (items.length > 0) {
          const itemInsertQuery = `
            INSERT INTO buyerprojectitems 
            (ProjectId, StyleMaterialNumber, StyleMaterialName, ItemType, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, AnnotatedImage) 
            VALUES ?
          `;
          const itemValues = items.map(item => [
            id,
            item.styleMaterialNumber || null,
            item.styleMaterialName || null,
            item.itemType || 'Style',
            item.colorway || null,
            item.colorwayStatus || null,
            item.selectionCondition || null,
            parseDate(item.sampleDue),
            item.buyerComments || null,
            item.internalComments || null,
            item.annotatedImage || null
          ]);
          await connection.query(itemInsertQuery, [itemValues]);
        }
      }

      await connection.query(
        `UPDATE buyerprojects 
         SET Items = (SELECT COUNT(DISTINCT StyleMaterialNumber) FROM buyerprojectitems WHERE ProjectId = ?) 
         WHERE Id = ?`,
        [id, id]
      );

      await connection.commit();
      return id;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async projectExists(id) {
    const [rows] = await db.query('SELECT Id FROM buyerprojects WHERE Id = ? AND IsDelete = 0', [id]);
    return rows.length > 0;
  }

  async deleteProject(id, userId, userName) {
    const safeUserId = String(userId || 'unknown').slice(0, 100);
    const safeUserName = String(userName || 'unknown').slice(0, 100);
    console.log(`[AUDIT] Deleting project ID ${id} by User "${safeUserName}" (ID: ${safeUserId})`);
    const [result] = await db.query('UPDATE buyerprojects SET IsDelete = 1 WHERE Id = ? AND IsDelete = 0', [id]);
    return result.affectedRows > 0;
  }

  async lockProject(id) {
    const [result] = await db.query(
      "UPDATE buyerprojects SET IsLocked = 1, ProjectType = 'SYNCRO PLM Project' WHERE Id = ? AND IsDelete = 0",
      [id]
    );
    return result.affectedRows > 0;
  }

  async isProjectLocked(id) {
    const [rows] = await db.query(
      'SELECT IsLocked FROM buyerprojects WHERE Id = ? AND IsDelete = 0',
      [id]
    );
    return rows.length > 0 && rows[0].IsLocked === 1;
  }
}

module.exports = new ProjectService();
