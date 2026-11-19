const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const itemService = require('../src/services/item.service');
const { db } = require('../src/services/common');
const s3Service = require('../src/services/s3Service');

describe('ItemService Image & Auto-save Tests', () => {
  const oldS3Url = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/old.jpg';
  const newS3Url = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/new.jpg';

  test('updateItemAnnotatedImage updates AnnotatedImage without overwriting other columns', async () => {
    const executedQueries = [];
    const mockConnection = {
      beginTransaction: mock.fn(async () => {}),
      commit: mock.fn(async () => {}),
      rollback: mock.fn(async () => {}),
      release: mock.fn(() => {}),
      query: mock.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT ProjectId, StyleMaterialNumber')) {
          return [[{ ProjectId: 10, StyleMaterialNumber: 'STYLE-101', AnnotatedImage: JSON.stringify([oldS3Url]) }]];
        }
        if (sql.includes('SELECT Id FROM buyerprojects')) {
          return [[{ Id: 10 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };

    const originalGetConn = db.getConnection;
    db.getConnection = async () => mockConnection;

    const deletedUrls = [];
    const originalDelete = s3Service.deleteImageFromS3;
    s3Service.deleteImageFromS3 = async (url) => {
      deletedUrls.push(url);
      return true;
    };

    try {
      const result = await itemService.updateItemAnnotatedImage(99, JSON.stringify([newS3Url]));
      assert.equal(result, true);

      // Verify AnnotatedImage was updated for all items with this StyleMaterialNumber in project
      const updateQuery = executedQueries.find(q => q.sql.includes('UPDATE buyerprojectitems SET AnnotatedImage = ?'));
      assert.ok(updateQuery, 'Should have executed update on buyerprojectitems');
      assert.equal(updateQuery.params[0], JSON.stringify([newS3Url]));
      assert.equal(updateQuery.params[1], 10); // ProjectId
      assert.equal(updateQuery.params[2], 'STYLE-101'); // StyleMaterialNumber

      // Verify none of the other columns (StyleMaterialName, Colorway, etc.) were modified in this query
      assert.ok(!updateQuery.sql.includes('StyleMaterialName ='), 'Must not touch StyleMaterialName');
      assert.ok(!updateQuery.sql.includes('Colorway ='), 'Must not touch Colorway');

      // Verify old S3 image cleanup was triggered
      assert.equal(deletedUrls.length, 1);
      assert.equal(deletedUrls[0], oldS3Url);
    } finally {
      db.getConnection = originalGetConn;
      s3Service.deleteImageFromS3 = originalDelete;
    }
  });

  test('updateItem preserves existing fields when only annotatedImage is updated', async () => {
    const executedQueries = [];
    const existingRow = {
      Id: 100,
      ProjectId: 20,
      StyleId: 1234,
      ColorId: 56,
      ColorStatusId: 7,
      StyleMaterialNumber: 'STYLE-PRESERVE',
      StyleMaterialName: 'Preserved Style Name',
      ItemType: 'Style',
      Colorway: 'Red',
      ColorwayStatus: 'Selected',
      SelectionCondition: 'As-Is',
      SampleDue: '2026-08-01',
      BuyerComments: 'Important buyer note',
      InternalComments: 'Internal team note',
      NotInPLM: 0,
      AnnotatedImage: JSON.stringify([oldS3Url]),
      CreatedDate: '2026-07-01',
    };

    const mockConnection = {
      beginTransaction: mock.fn(async () => {}),
      commit: mock.fn(async () => {}),
      rollback: mock.fn(async () => {}),
      release: mock.fn(() => {}),
      query: mock.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT * FROM buyerprojectitems WHERE Id = ?')) {
          return [[existingRow]];
        }
        if (sql.includes('SELECT Id FROM buyerprojects')) {
          return [[{ Id: 20 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };

    const originalGetConn = db.getConnection;
    db.getConnection = async () => mockConnection;

    try {
      // Partial update supplying ONLY annotatedImage
      const updated = await itemService.updateItem(100, {
        annotatedImage: JSON.stringify([newS3Url]),
      });

      assert.equal(updated.id, 100);

      // Verify the single row UPDATE kept existing values rather than nulling them
      const singleUpdate = executedQueries.find(q =>
        q.sql.includes('UPDATE buyerprojectitems') && q.sql.includes('WHERE Id = ?')
      );
      assert.ok(singleUpdate);
      const [
        styleIdParam,
        colorIdParam,
        colorStatusIdParam,
        styleMaterialNumberParam,
        styleMaterialNameParam,
        colorwayParam,
        colorwayStatusParam,
        selectionConditionParam,
        _sampleDueParam,
        buyerCommentsParam,
        internalCommentsParam,
        annotatedImageParam,
        idParam
      ] = singleUpdate.params;

      assert.equal(styleIdParam, 1234, 'StyleId must be preserved');
      assert.equal(colorIdParam, 56, 'ColorId must be preserved');
      assert.equal(colorStatusIdParam, 7, 'ColorStatusId must be preserved');
      assert.equal(styleMaterialNumberParam, 'STYLE-PRESERVE', 'StyleMaterialNumber must be preserved');
      assert.equal(styleMaterialNameParam, 'Preserved Style Name', 'StyleMaterialName must be preserved');
      assert.equal(colorwayParam, 'Red', 'Colorway must be preserved');
      assert.equal(colorwayStatusParam, 'Selected', 'ColorwayStatus must be preserved');
      assert.equal(selectionConditionParam, 'As-Is', 'SelectionCondition must be preserved');
      assert.equal(buyerCommentsParam, 'Important buyer note', 'BuyerComments must be preserved');
      assert.equal(internalCommentsParam, 'Internal team note', 'InternalComments must be preserved');
      assert.equal(annotatedImageParam, JSON.stringify([newS3Url]), 'AnnotatedImage must be updated');
      assert.equal(idParam, 100);
    } finally {
      db.getConnection = originalGetConn;
    }
  });

  test('updateItemAnnotatedImage deletes S3 image when image is cleared ([])', async () => {
    const executedQueries = [];
    const mockConnection = {
      beginTransaction: mock.fn(async () => {}),
      commit: mock.fn(async () => {}),
      rollback: mock.fn(async () => {}),
      release: mock.fn(() => {}),
      query: mock.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT ProjectId, StyleMaterialNumber')) {
          return [[{ ProjectId: 5, StyleMaterialNumber: 'STYLE-DELETE', AnnotatedImage: JSON.stringify([oldS3Url]) }]];
        }
        if (sql.includes('SELECT Id FROM buyerprojects')) {
          return [[{ Id: 5 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };

    const originalGetConn = db.getConnection;
    db.getConnection = async () => mockConnection;

    const deletedUrls = [];
    const originalDelete = s3Service.deleteImageFromS3;
    s3Service.deleteImageFromS3 = async (url) => {
      deletedUrls.push(url);
      return true;
    };

    try {
      // User deletes image, setting it to '[]'
      const result = await itemService.updateItemAnnotatedImage(50, '[]');
      assert.equal(result, true);

      // Verify S3 deletion was invoked
      assert.equal(deletedUrls.length, 1);
      assert.equal(deletedUrls[0], oldS3Url);
    } finally {
      db.getConnection = originalGetConn;
      s3Service.deleteImageFromS3 = originalDelete;
    }
  });

  test('deleteItem deletes style folder from S3 when deleting the last item of a style', async () => {
    const executedQueries = [];
    const mockConnection = {
      beginTransaction: mock.fn(async () => {}),
      commit: mock.fn(async () => {}),
      rollback: mock.fn(async () => {}),
      release: mock.fn(() => {}),
      query: mock.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM buyerprojectitems i')) {
          return [[{
            ProjectId: 1,
            StyleMaterialNumber: 'STYLE-SOLO',
            AnnotatedImage: JSON.stringify([oldS3Url]),
            ProjectName: 'Summer2026',
          }]];
        }
        if (sql.includes('SELECT Id FROM buyerprojects WHERE Id = ? FOR UPDATE')) {
          return [[{ Id: 1 }]];
        }
        if (sql.includes('SELECT Id, AnnotatedImage FROM buyerprojectitems WHERE ProjectId = ? AND StyleMaterialNumber = ? AND Id != ?')) {
          return [[]]; // No siblings left
        }
        return [{ affectedRows: 1 }];
      }),
    };

    const originalGetConn = db.getConnection;
    db.getConnection = async () => mockConnection;

    let deletedFolder = null;
    const originalDeleteStyleFolder = s3Service.deleteStyleFolderFromS3;
    s3Service.deleteStyleFolderFromS3 = async (proj, style) => {
      deletedFolder = { proj, style };
      return true;
    };

    try {
      const result = await itemService.deleteItem(10);
      assert.equal(result, true);
      assert.ok(deletedFolder, 'Should have deleted style folder in S3');
      assert.equal(deletedFolder.proj, 'Summer2026');
      assert.equal(deletedFolder.style, 'STYLE-SOLO');
    } finally {
      db.getConnection = originalGetConn;
      s3Service.deleteStyleFolderFromS3 = originalDeleteStyleFolder;
    }
  });

  test('deleteItem cleans up unique item annotation S3 images when sibling items remain', async () => {
    const executedQueries = [];
    const uniqueAnnotationUrl = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/unique_annot.jpg';
    const sharedAnnotationUrl = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/shared_annot.jpg';

    const mockConnection = {
      beginTransaction: mock.fn(async () => {}),
      commit: mock.fn(async () => {}),
      rollback: mock.fn(async () => {}),
      release: mock.fn(() => {}),
      query: mock.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM buyerprojectitems i')) {
          return [[{
            ProjectId: 1,
            StyleMaterialNumber: 'STYLE-SIBLING',
            AnnotatedImage: JSON.stringify([uniqueAnnotationUrl, sharedAnnotationUrl]),
            ProjectName: 'Summer2026',
          }]];
        }
        if (sql.includes('SELECT Id FROM buyerprojects WHERE Id = ? FOR UPDATE')) {
          return [[{ Id: 1 }]];
        }
        if (sql.includes('SELECT Id, AnnotatedImage FROM buyerprojectitems WHERE ProjectId = ? AND StyleMaterialNumber = ? AND Id != ?')) {
          return [[{ Id: 11, AnnotatedImage: JSON.stringify([sharedAnnotationUrl]) }]]; // sibling shares sharedAnnotationUrl
        }
        return [{ affectedRows: 1 }];
      }),
    };

    const originalGetConn = db.getConnection;
    db.getConnection = async () => mockConnection;

    const deletedImages = [];
    const originalDeleteImage = s3Service.deleteImageFromS3;
    s3Service.deleteImageFromS3 = async (url) => {
      deletedImages.push(url);
      return true;
    };

    try {
      const result = await itemService.deleteItem(10);
      assert.equal(result, true);
      // Only uniqueAnnotationUrl should be deleted, not the shared one
      assert.equal(deletedImages.length, 1);
      assert.equal(deletedImages[0], uniqueAnnotationUrl);
    } finally {
      db.getConnection = originalGetConn;
      s3Service.deleteImageFromS3 = originalDeleteImage;
    }
  });
});
