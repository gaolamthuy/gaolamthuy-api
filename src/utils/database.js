const { createClient } = require("@supabase/supabase-js");

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Common database query wrapper with standardized error handling
 * @param {Function} queryFn - Function that performs the Supabase query
 * @returns {Promise<Object>} - { data, error } with standardized format
 */
const executeQuery = async (queryFn) => {
  try {
    const result = await queryFn(supabase);
    return { data: result.data, error: result.error };
  } catch (error) {
    console.error('Database query error:', error);
    return { data: null, error: { message: error.message } };
  }
};

/**
 * Get a record by a specific field
 * @param {string} table - Table name
 * @param {string} field - Field name
 * @param {any} value - Field value
 * @param {string} select - Fields to select
 * @returns {Promise<Object>} - { data, error }
 */
const getRecordByField = (table, field, value, select = '*') => {
  return executeQuery(db => 
    db.from(table).select(select).eq(field, value).single()
  );
};

/**
 * Insert a record
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @param {string} select - Fields to return after insert
 * @returns {Promise<Object>} - { data, error }
 */
const insertRecord = (table, data, select = '*') => {
  return executeQuery(db => 
    db.from(table).insert([data]).select(select).single()
  );
};

/**
 * Update a record
 * @param {string} table - Table name
 * @param {string} field - Field name for condition
 * @param {any} value - Field value for condition
 * @param {Object} data - Data to update
 * @param {string} select - Fields to return after update
 * @returns {Promise<Object>} - { data, error }
 */
const updateRecord = (table, field, value, data, select = '*') => {
  return executeQuery(db => 
    db.from(table).update(data).eq(field, value).select(select).single()
  );
};

module.exports = {
  supabase,
  executeQuery,
  getRecordByField,
  insertRecord,
  updateRecord
}; 