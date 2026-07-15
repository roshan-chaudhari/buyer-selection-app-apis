const { db, parseDate, mapItemRow } = require('./common');

class ItemService {
  async getItemsByProjectId(projectId) {
    const query = `
      SELECT Id, ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, AnnotatedImage, CreatedDate 
      FROM buyerprojectitems 
      WHERE ProjectId = ?;
    `;
    const [rows] = await db.query(query, [projectId]);
    return rows.map(mapItemRow);
  }

  async getItemById(itemId) {
    const [rows] = await db.query(
      `SELECT Id, ProjectId FROM buyerprojectitems WHERE Id = ?`,
      [itemId]
    );
    if (rows.length === 0) return null;
    return { id: rows[0].Id, projectId: rows[0].ProjectId };
  }

  async addItemToProject(projectId, itemData) {
    const { styleId, colorId, colorStatusId, styleMaterialNumber, styleMaterialName, colorway, colorwayStatus, selectionCondition, sampleDue, buyerComments, internalComments } = itemData;
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [projectRows] = await connection.query('SELECT Id FROM buyerprojects WHERE Id = ? AND IsDelete = 0 FOR UPDATE', [projectId]);
      if (projectRows.length === 0) {
        await connection.rollback();
        return null;
      }

      if (styleMaterialNumber) {
        const [dupRows] = await connection.query(
          'SELECT Id FROM buyerprojectitems WHERE ProjectId = ? AND StyleMaterialNumber = ? AND Colorway = ?',
          [projectId, styleMaterialNumber, colorway || '']
        );
        if (dupRows.length > 0) {
          await connection.rollback();
          const error = new Error(`Item with style "${styleMaterialNumber}" and colorway "${colorway || ''}" already exists in this project.`);
          error.statusCode = 400;
          throw error;
        }
      }

      const [result] = await connection.query(
        `INSERT INTO buyerprojectitems 
         (ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, AnnotatedImage) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          styleId || 0,
          colorId || 0,
          colorStatusId || 0,
          styleMaterialNumber || null,
          styleMaterialName || null,
          colorway || null,
          colorwayStatus || null,
          selectionCondition || null,
          parseDate(sampleDue),
          buyerComments || null,
          internalComments || null,
          itemData.annotatedImage || null
        ]
      );

      const itemId = result.insertId;

      await connection.query(
        `UPDATE buyerprojects 
         SET Items = (SELECT COUNT(DISTINCT StyleMaterialNumber) FROM buyerprojectitems WHERE ProjectId = ?), LastUpdated = CURRENT_TIMESTAMP 
         WHERE Id = ?`,
        [projectId, projectId]
      );

      await connection.commit();

      const [inserted] = await db.query(
        `SELECT Id, ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, AnnotatedImage, CreatedDate
         FROM buyerprojectitems WHERE Id = ?`,
        [itemId]
      );
      return inserted.length > 0 ? mapItemRow(inserted[0]) : null;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateItem(itemId, itemData) {
    const { styleId, colorId, colorStatusId, styleMaterialNumber, styleMaterialName, colorway, colorwayStatus, selectionCondition, sampleDue, buyerComments, internalComments, annotatedImage, colorwaysWithIds } = itemData;
    
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [itemRows] = await connection.query('SELECT ProjectId, StyleMaterialNumber, CreatedDate FROM buyerprojectitems WHERE Id = ?', [itemId]);
      if (itemRows.length === 0) {
        await connection.rollback();
        return null;
      }
      const projectId = itemRows[0].ProjectId;
      const currentStyleNumber = itemRows[0].StyleMaterialNumber;

      // Lock parent project row to avoid deadlocks on concurrent writes
      await connection.query('SELECT Id FROM buyerprojects WHERE Id = ? FOR UPDATE', [projectId]);

      const isColorwaySync = Array.isArray(colorwaysWithIds);
      let firstColorId = colorId || 0;

      if (isColorwaySync) {
        // Create a map of color name to color ID from frontend payload mapping
        const colorIdMap = new Map();
        colorwaysWithIds.forEach(cw => {
          if (cw && cw.colorway) {
            colorIdMap.set(cw.colorway.toLowerCase(), cw.colorId || 0);
          }
        });

        // Split the comma-separated list of colorways
        const selectedColorways = (colorway || '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);

        const colorsToSync = selectedColorways.length > 0 ? selectedColorways : [''];

        // Fetch all existing rows for this style group in the project
        const [existingRows] = await connection.query(
          'SELECT Id, Colorway, ColorId FROM buyerprojectitems WHERE ProjectId = ? AND StyleMaterialNumber = ?',
          [projectId, currentStyleNumber]
        );

        const existingMap = new Map();
        existingRows.forEach((r) => {
          existingMap.set((r.Colorway || '').toLowerCase(), r);
        });

        const colorsToKeep = new Set(colorsToSync.map(c => c.toLowerCase()));
        const rowsToDelete = existingRows.filter(r => !colorsToKeep.has((r.Colorway || '').toLowerCase()));

        const primaryRow = existingRows.find(r => r.Id === Number(itemId));
        const remainingColors = [...colorsToSync];
        
        if (primaryRow && remainingColors.length > 0) {
          const firstColor = remainingColors.shift();
          firstColorId = colorIdMap.get((firstColor || '').toLowerCase()) || colorId || 0;
          await connection.query(
            `UPDATE buyerprojectitems 
             SET StyleId = ?, ColorId = ?, ColorStatusId = ?, StyleMaterialNumber = ?, StyleMaterialName = ?, Colorway = ?, ColorwayStatus = ?, SelectionCondition = ?, SampleDue = ?, BuyerComments = ?, InternalComments = ?, AnnotatedImage = ? 
             WHERE Id = ?`,
            [
              styleId || 0,
              firstColorId,
              colorStatusId || 0,
              styleMaterialNumber || null,
              styleMaterialName || null,
              firstColor,
              colorwayStatus || null,
              selectionCondition || null,
              parseDate(sampleDue),
              buyerComments || null,
              internalComments || null,
              annotatedImage !== undefined ? annotatedImage : null,
              itemId
            ]
          );
          existingMap.delete((primaryRow.Colorway || '').toLowerCase());
        }

        for (const color of remainingColors) {
          const existingRowForColor = existingMap.get(color.toLowerCase());
          const colorIdVal = colorIdMap.get(color.toLowerCase()) || 0;
          if (existingRowForColor) {
            await connection.query(
              `UPDATE buyerprojectitems 
               SET StyleId = ?, ColorId = ?, ColorStatusId = ?, StyleMaterialNumber = ?, StyleMaterialName = ?, Colorway = ?, ColorwayStatus = ?, SelectionCondition = ?, SampleDue = ?, AnnotatedImage = ? 
               WHERE Id = ?`,
              [
                styleId || 0,
                colorIdVal,
                colorStatusId || 0,
                styleMaterialNumber || null,
                styleMaterialName || null,
                color,
                colorwayStatus || null,
                selectionCondition || null,
                parseDate(sampleDue),
                annotatedImage !== undefined ? annotatedImage : null,
                existingRowForColor.Id
              ]
            );
            existingMap.delete(color.toLowerCase());
          } else {
            await connection.query(
              `INSERT INTO buyerprojectitems 
               (ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, AnnotatedImage) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                projectId,
                styleId || 0,
                colorIdVal,
                colorStatusId || 0,
                styleMaterialNumber || null,
                styleMaterialName || null,
                color,
                'Selected',
                selectionCondition || null,
                parseDate(sampleDue),
                '',
                '',
                annotatedImage !== undefined ? annotatedImage : null
              ]
            );
          }
        }

        for (const rowDel of rowsToDelete) {
          if (rowDel.Id !== Number(itemId)) {
            await connection.query('DELETE FROM buyerprojectitems WHERE Id = ?', [rowDel.Id]);
          }
        }
      } else {
        // Simple update: ONLY update the single colorway row by its unique ID
        await connection.query(
          `UPDATE buyerprojectitems 
           SET StyleId = ?, ColorId = ?, ColorStatusId = ?, StyleMaterialNumber = ?, StyleMaterialName = ?, Colorway = ?, ColorwayStatus = ?, SelectionCondition = ?, SampleDue = ?, BuyerComments = ?, InternalComments = ?, AnnotatedImage = ? 
           WHERE Id = ?`,
          [
            styleId || 0,
            colorId || 0,
            colorStatusId || 0,
            styleMaterialNumber || null,
            styleMaterialName || null,
            colorway || null,
            colorwayStatus || null,
            selectionCondition || null,
            parseDate(sampleDue),
            buyerComments || null,
            internalComments || null,
            annotatedImage !== undefined ? annotatedImage : null,
            itemId
          ]
        );
      }

      // Synchronize style-level properties for any remaining sibling items
      await connection.query(
        `UPDATE buyerprojectitems 
         SET StyleMaterialName = ?, SelectionCondition = ?, AnnotatedImage = ? 
         WHERE ProjectId = ? AND StyleMaterialNumber = ?`,
        [
          styleMaterialName || null,
          selectionCondition || null,
          annotatedImage !== undefined ? annotatedImage : null,
          projectId,
          styleMaterialNumber || currentStyleNumber
        ]
      );

      await connection.query('UPDATE buyerprojects SET LastUpdated = CURRENT_TIMESTAMP WHERE Id = ?', [projectId]);

      await connection.commit();

      return {
        id: Number(itemId),
        projectId: Number(projectId),
        styleId: styleId || 0,
        colorId: firstColorId,
        styleMaterialNumber: styleMaterialNumber || '',
        styleMaterialName: styleMaterialName || '',
        colorway: colorway || '',
        colorwayStatus: colorwayStatus || '',
        selectionCondition: selectionCondition || '',
        sampleDue: parseDate(sampleDue),
        buyerComments: buyerComments || '',
        internalComments: internalComments || '',
        annotatedImage: annotatedImage !== undefined ? annotatedImage : null,
        createdDate: itemRows[0].CreatedDate
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteItem(itemId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query('SELECT ProjectId FROM buyerprojectitems WHERE Id = ?', [itemId]);
      if (rows.length === 0) { await connection.rollback(); return false; }
      const projectId = rows[0].ProjectId;

      // Lock parent project row to avoid deadlocks on concurrent writes
      await connection.query('SELECT Id FROM buyerprojects WHERE Id = ? FOR UPDATE', [projectId]);

      const [result] = await connection.query('DELETE FROM buyerprojectitems WHERE Id = ?', [itemId]);
      if (result.affectedRows === 0) { await connection.rollback(); return false; }

      await connection.query(
        `UPDATE buyerprojects 
         SET Items = (SELECT COUNT(DISTINCT StyleMaterialNumber) FROM buyerprojectitems WHERE ProjectId = ?), LastUpdated = CURRENT_TIMESTAMP 
         WHERE Id = ?`,
        [projectId, projectId]
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new ItemService();
