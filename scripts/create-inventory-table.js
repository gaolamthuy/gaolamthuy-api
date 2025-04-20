require('dotenv').config();
const { Pool } = require('pg');

// Create a connection to your database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

async function createInventoriesTable() {
  try {
    console.log('🔄 Creating kiotviet_inventories table...');
    
    const client = await pool.connect();
    
    try {
      // Create the inventories table
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS public.kiotviet_inventories (
          id bigserial NOT NULL,
          product_id bigint NOT NULL,
          kiotviet_product_id bigint NOT NULL,
          product_code text,
          product_name text,
          branch_id bigint,
          branch_name text,
          cost numeric(20, 10),
          on_hand numeric(20, 3),
          reserved numeric(20, 3),
          actual_reserved numeric(20, 3),
          min_quantity numeric(20, 3),
          max_quantity numeric(20, 3),
          is_active boolean,
          on_order numeric(20, 3),
          CONSTRAINT kiotviet_inventories_pkey PRIMARY KEY (id),
          CONSTRAINT fk_kiotviet_inventories_product FOREIGN KEY (product_id) 
            REFERENCES public.kiotviet_products(id) ON DELETE CASCADE
        );
      `;
      
      // Create indexes
      const createIndexes = `
        CREATE INDEX IF NOT EXISTS idx_kiotviet_inventories_product_id 
          ON public.kiotviet_inventories USING btree (product_id);
        
        CREATE INDEX IF NOT EXISTS idx_kiotviet_inventories_branch_id 
          ON public.kiotviet_inventories USING btree (branch_id);
      `;
      
      await client.query(createTableQuery);
      console.log('✅ Table structure created successfully');
      
      await client.query(createIndexes);
      console.log('✅ Indexes created successfully');
      
      console.log('✅ kiotviet_inventories table created successfully!');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error creating kiotviet_inventories table:', error);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Execute the function
createInventoriesTable(); 