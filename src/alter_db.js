const db = require('./config/db');

async function alterTable() {
  try {
    // ── Migration 1: Add InternalComments to buyerprojectitems (idempotent) ──
    const [itemCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buyerprojectitems' AND COLUMN_NAME = 'InternalComments'`
    );
    if (itemCols.length === 0) {
      console.log('Adding InternalComments column to buyerprojectitems...');
      await db.query(
        `ALTER TABLE buyerprojectitems ADD COLUMN InternalComments TEXT NULL AFTER BuyerComments`
      );
      console.log('buyerprojectitems altered successfully.');
    } else {
      console.log('InternalComments already exists — skipping.');
    }

    // ── Migration 2: Add IsLocked to buyerprojects (idempotent) ─────────────
    const [projCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buyerprojects' AND COLUMN_NAME = 'IsLocked'`
    );
    if (projCols.length === 0) {
      console.log('Adding IsLocked column to buyerprojects...');
      await db.query(
        `ALTER TABLE buyerprojects ADD COLUMN IsLocked TINYINT(1) NOT NULL DEFAULT 0 AFTER ProjectType`
      );
      console.log('buyerprojects.IsLocked added successfully.');
    } else {
      console.log('IsLocked already exists — skipping.');
    }

    const [desc] = await db.query('DESCRIBE buyerprojects');
    console.log('Current buyerprojects columns:');
    console.table(desc);
  } catch (error) {
    console.error('Error running migrations:', error);
  } finally {
    process.exit(0);
  }
}

alterTable();
