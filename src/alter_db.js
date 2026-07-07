const db = require('./config/db');

async function alterTable() {
  try {
    console.log('Altering buyerprojectitems table to add InternalComments TEXT NULL column...');
    
    // Add InternalComments column after BuyerComments
    const query = `
      ALTER TABLE buyerprojectitems 
      ADD COLUMN InternalComments TEXT NULL AFTER BuyerComments;
    `;
    
    await db.query(query);
    console.log('Table buyerprojectitems altered successfully!');
    
    // Fetch and display the new table description to verify the change
    const [desc] = await db.query('DESCRIBE buyerprojectitems');
    console.log('Updated column definitions for buyerprojectitems:');
    console.table(desc);
  } catch (error) {
    console.error('Error altering table:', error);
  } finally {
    db.end();
  }
}

alterTable();
