const { db, parseDate, mapItemRow } = require('./common');
const s3Service = require('./s3Service');

class ItemService {
  async getItemsByProjectId(projectId) {
    const query = `
      SELECT Id, ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, ItemType, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, NotInPLM, AnnotatedImage, CreatedDate 
      FROM buyerprojectitems 
      WHERE ProjectId = ? ORDER BY StyleMaterialNumber ASC, Id ASC;
    `;
    const [rows] = await db.query(query, [projectId]);
    return rows.map(mapItemRow);
  }

  async getItemById(itemId) {
    const [rows] = await db.query(
      `SELECT Id, ProjectId, StyleMaterialNumber, AnnotatedImage FROM buyerprojectitems WHERE Id = ?`,
      [itemId]
    );
    if (rows.length === 0) return null;
    return {
      id: rows[0].Id,
      projectId: rows[0].ProjectId,
      styleMaterialNumber: rows[0].StyleMaterialNumber,
      annotatedImage: rows[0].AnnotatedImage
    };
  }

  async updateItemAnnotatedImage(itemId, annotatedImage) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [itemRows] = await connection.query(
        'SELECT ProjectId, StyleMaterialNumber, AnnotatedImage FROM buyerprojectitems WHERE Id = ?',
        [itemId]
      );
      if (itemRows.length === 0) {
        await connection.rollback();
        return null;
      }
      const { ProjectId, StyleMaterialNumber, AnnotatedImage: oldAnnotatedImage } = itemRows[0];

      // Lock parent project row
      await connection.query('SELECT Id FROM buyerprojects WHERE Id = ? FOR UPDATE', [ProjectId]);

      const newAnnotatedImage = annotatedImage !== undefined ? annotatedImage : null;

      // Update AnnotatedImage for this item and all sibling items with same StyleMaterialNumber in project
      if (StyleMaterialNumber) {
        await connection.query(
          'UPDATE buyerprojectitems SET AnnotatedImage = ? WHERE ProjectId = ? AND StyleMaterialNumber = ?',
          [newAnnotatedImage, ProjectId, StyleMaterialNumber]
        );
      } else {
        await connection.query(
          'UPDATE buyerprojectitems SET AnnotatedImage = ? WHERE Id = ?',
          [newAnnotatedImage, itemId]
        );
      }

      await connection.query('UPDATE buyerprojects SET LastUpdated = CURRENT_TIMESTAMP WHERE Id = ?', [ProjectId]);

      await connection.commit();

      // Clean up any removed S3 images
      if (oldAnnotatedImage) {
        try {
          const s3Service = require('./s3Service');
          const oldUrls = s3Service.extractS3Urls(oldAnnotatedImage);
          const newUrls = new Set(s3Service.extractS3Urls(newAnnotatedImage));
          for (const oldUrl of oldUrls) {
            if (!newUrls.has(oldUrl)) {
              s3Service.deleteImageFromS3(oldUrl).catch(() => {});
            }
          }
        } catch (e) {}
      }

      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async addItemToProject(projectId, itemData) {
    const { styleId, colorId, colorStatusId, styleMaterialNumber, styleMaterialName, itemType, colorway, colorwayStatus, selectionCondition, sampleDue, buyerComments, internalComments, notInPLM } = itemData;
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
         (ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, ItemType, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, NotInPLM, AnnotatedImage) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          styleId || 0,
          colorId || 0,
          colorStatusId || 0,
          styleMaterialNumber || null,
          styleMaterialName || null,
          itemType || 'Style',
          colorway || null,
          colorwayStatus || null,
          selectionCondition || null,
          parseDate(sampleDue),
          buyerComments || null,
          internalComments || null,
          notInPLM ? 1 : 0,
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
        `SELECT Id, ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, ItemType, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, NotInPLM, AnnotatedImage, CreatedDate
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

      const [itemRows] = await connection.query('SELECT * FROM buyerprojectitems WHERE Id = ?', [itemId]);
      if (itemRows.length === 0) {
        await connection.rollback();
        return null;
      }
      const existingItem = itemRows[0];
      const projectId = existingItem.ProjectId;
      const currentStyleNumber = existingItem.StyleMaterialNumber;
      const currentNotInPlm = existingItem.NotInPLM ? 1 : 0;

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
               (ProjectId, StyleId, ColorId, ColorStatusId, StyleMaterialNumber, StyleMaterialName, Colorway, ColorwayStatus, SelectionCondition, SampleDue, BuyerComments, InternalComments, NotInPLM, AnnotatedImage) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                currentNotInPlm,
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
        // Simple update: ONLY update the single colorway row by its unique ID, preserving existing values for omitted fields
        await connection.query(
          `UPDATE buyerprojectitems 
           SET StyleId = ?, ColorId = ?, ColorStatusId = ?, StyleMaterialNumber = ?, StyleMaterialName = ?, Colorway = ?, ColorwayStatus = ?, SelectionCondition = ?, SampleDue = ?, BuyerComments = ?, InternalComments = ?, AnnotatedImage = ? 
           WHERE Id = ?`,
          [
            styleId !== undefined ? (styleId || 0) : existingItem.StyleId,
            colorId !== undefined ? (colorId || 0) : existingItem.ColorId,
            colorStatusId !== undefined ? (colorStatusId || 0) : existingItem.ColorStatusId,
            styleMaterialNumber !== undefined ? (styleMaterialNumber || null) : existingItem.StyleMaterialNumber,
            styleMaterialName !== undefined ? (styleMaterialName || null) : existingItem.StyleMaterialName,
            colorway !== undefined ? (colorway || null) : existingItem.Colorway,
            colorwayStatus !== undefined ? (colorwayStatus || null) : existingItem.ColorwayStatus,
            selectionCondition !== undefined ? (selectionCondition || null) : existingItem.SelectionCondition,
            sampleDue !== undefined ? parseDate(sampleDue) : existingItem.SampleDue,
            buyerComments !== undefined ? (buyerComments || null) : existingItem.BuyerComments,
            internalComments !== undefined ? (internalComments || null) : existingItem.InternalComments,
            annotatedImage !== undefined ? annotatedImage : existingItem.AnnotatedImage,
            itemId
          ]
        );
      }

      // Synchronize style-level properties for any remaining sibling items
      const updateFields = [];
      const updateParams = [];
      if (styleMaterialName !== undefined) {
        updateFields.push('StyleMaterialName = ?');
        updateParams.push(styleMaterialName || null);
      }
      if (selectionCondition !== undefined) {
        updateFields.push('SelectionCondition = ?');
        updateParams.push(selectionCondition || null);
      }
      if (annotatedImage !== undefined) {
        updateFields.push('AnnotatedImage = ?');
        updateParams.push(annotatedImage);
      }
      if (updateFields.length > 0) {
        updateParams.push(projectId, styleMaterialNumber || currentStyleNumber);
        await connection.query(
          `UPDATE buyerprojectitems SET ${updateFields.join(', ')} WHERE ProjectId = ? AND StyleMaterialNumber = ?`,
          updateParams
        );
      }

      await connection.query('UPDATE buyerprojects SET LastUpdated = CURRENT_TIMESTAMP WHERE Id = ?', [projectId]);

      await connection.commit();

      // Clean up any removed S3 images if annotatedImage changed
      if (annotatedImage !== undefined && existingItem.AnnotatedImage) {
        try {
          const s3Service = require('./s3Service');
          const oldUrls = s3Service.extractS3Urls(existingItem.AnnotatedImage);
          const newUrls = new Set(s3Service.extractS3Urls(annotatedImage));
          for (const oldUrl of oldUrls) {
            if (!newUrls.has(oldUrl)) {
              s3Service.deleteImageFromS3(oldUrl).catch(() => {});
            }
          }
        } catch (e) {}
      }

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
    let cleanupS3Info = null;

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT i.ProjectId, i.StyleMaterialNumber, i.AnnotatedImage, p.ProjectName 
         FROM buyerprojectitems i 
         LEFT JOIN buyerprojects p ON i.ProjectId = p.Id 
         WHERE i.Id = ?`,
        [itemId]
      );
      if (rows.length === 0) { await connection.rollback(); return false; }
      
      const { ProjectId: projectId, StyleMaterialNumber: styleMaterialNumber, AnnotatedImage: annotatedImage, ProjectName: projectName } = rows[0];

      // Lock parent project row to avoid deadlocks on concurrent writes
      await connection.query('SELECT Id FROM buyerprojects WHERE Id = ? FOR UPDATE', [projectId]);

      // Check if there are other sibling colorway items for this style in the project
      const [siblings] = await connection.query(
        'SELECT Id, AnnotatedImage FROM buyerprojectitems WHERE ProjectId = ? AND StyleMaterialNumber = ? AND Id != ?',
        [projectId, styleMaterialNumber, itemId]
      );

      const [result] = await connection.query('DELETE FROM buyerprojectitems WHERE Id = ?', [itemId]);
      if (result.affectedRows === 0) { await connection.rollback(); return false; }

      await connection.query(
        `UPDATE buyerprojects 
         SET Items = (SELECT COUNT(DISTINCT StyleMaterialNumber) FROM buyerprojectitems WHERE ProjectId = ?), LastUpdated = CURRENT_TIMESTAMP 
         WHERE Id = ?`,
        [projectId, projectId]
      );

      await connection.commit();

      cleanupS3Info = {
        projectName,
        styleMaterialNumber,
        annotatedImage,
        isLastOfStyle: siblings.length === 0,
        siblings,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    // Clean up S3 files after DB delete succeeds
    if (cleanupS3Info) {
      try {
        const { projectName, styleMaterialNumber, annotatedImage, isLastOfStyle, siblings } = cleanupS3Info;
        if (isLastOfStyle && projectName && styleMaterialNumber) {
          // If no remaining colorways exist for this style in this project, delete the entire style folder from S3
          await s3Service.deleteStyleFolderFromS3(projectName, styleMaterialNumber);
        } else if (annotatedImage) {
          // If other colorways exist, only delete annotation images unique to this deleted item
          const itemUrls = s3Service.extractS3Urls(annotatedImage);
          const siblingUrls = new Set();
          siblings.forEach((s) => {
            s3Service.extractS3Urls(s.AnnotatedImage).forEach((u) => siblingUrls.add(u));
          });
          for (const u of itemUrls) {
            if (!siblingUrls.has(u) && !s3Service.isPlmDefaultImage(u)) {
              await s3Service.deleteImageFromS3(u);
            }
          }
        }
      } catch (s3Err) {
        console.error(`[itemService] Failed to clean up S3 images for deleted item ${itemId}:`, s3Err.message);
      }
    }

    return true;
  }
}

module.exports = new ItemService();

