# KiotViet Integration Guide

This guide provides detailed information for developers who need to work with the KiotViet integration service.

## System Architecture

```
┌─────────────┐      ┌────────────────┐      ┌─────────────┐
│  KiotViet   │─────▶│ Internal Service│─────▶│  Supabase   │
│   API       │      │   (Node.js)     │      │  Database   │
└─────────────┘      └────────────────┘      └─────────────┘
                             │
                             ▼
                     ┌─────────────────┐
                     │  Client Apps    │
                     │ (Web/Mobile)    │
                     └─────────────────┘
```

## Authentication Flow

1. The service uses a token stored in the Supabase `system` table to authenticate with KiotViet
2. API requests to this service require a secret token passed in the Authorization header

## Database Schema

### Products Tables

**kiotviet_products**
```sql
CREATE TABLE kiotviet_products (
  id SERIAL PRIMARY KEY,
  kiotviet_id INTEGER UNIQUE,
  retailer_id INTEGER,
  code TEXT,
  bar_code TEXT,
  name TEXT,
  full_name TEXT,
  category_id INTEGER,
  category_name TEXT,
  allows_sale BOOLEAN,
  type TEXT,
  has_variants BOOLEAN,
  base_price DECIMAL,
  weight DECIMAL,
  unit TEXT,
  master_product_id INTEGER,
  master_unit_id INTEGER,
  conversion_value DECIMAL,
  description TEXT,
  modified_date TIMESTAMP,
  created_date TIMESTAMP,
  is_active BOOLEAN,
  order_template TEXT,
  is_lot_serial_control BOOLEAN,
  is_batch_expire_control BOOLEAN,
  trade_mark_name TEXT,
  trade_mark_id INTEGER,
  images JSONB
);
```

**kiotviet_inventories**
```sql
CREATE TABLE kiotviet_inventories (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES kiotviet_products(id),
  branch_id INTEGER,
  branch_name TEXT,
  on_hand DECIMAL,
  available DECIMAL,
  cost DECIMAL,
  reserved DECIMAL,
  min_quantity DECIMAL,
  max_quantity DECIMAL
);
```

### Customers Table

```sql
CREATE TABLE kiotviet_customers (
  id SERIAL PRIMARY KEY,
  kiotviet_id INTEGER UNIQUE,
  code TEXT,
  name TEXT,
  retailer_id INTEGER,
  branch_id INTEGER,
  location_name TEXT,
  ward_name TEXT,
  modified_date TIMESTAMP,
  created_date TIMESTAMP,
  type TEXT,
  groups JSONB,
  debt DECIMAL,
  contact_number TEXT,
  comments TEXT,
  address TEXT
);
```

### Invoices Tables

**kiotviet_invoices**
```sql
CREATE TABLE kiotviet_invoices (
  id SERIAL PRIMARY KEY,
  kiotviet_id INTEGER UNIQUE,
  uuid TEXT,
  code TEXT,
  purchase_date TIMESTAMP,
  branch_id INTEGER,
  branch_name TEXT,
  sold_by_id INTEGER,
  sold_by_name TEXT,
  kiotviet_customer_id INTEGER,
  customer_id INTEGER REFERENCES kiotviet_customers(id),
  customer_code TEXT,
  customer_name TEXT,
  order_code TEXT,
  total DECIMAL,
  total_payment DECIMAL,
  status INTEGER,
  status_value TEXT,
  using_cod BOOLEAN,
  created_date TIMESTAMP
);
```

**kiotviet_invoice_details**
```sql
CREATE TABLE kiotviet_invoice_details (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES kiotviet_invoices(id),
  kiotviet_product_id INTEGER,
  product_id INTEGER REFERENCES kiotviet_products(id),
  product_code TEXT,
  product_name TEXT,
  category_id INTEGER,
  category_name TEXT,
  quantity DECIMAL,
  price DECIMAL,
  discount DECIMAL,
  sub_total DECIMAL,
  note TEXT,
  serial_numbers JSONB,
  return_quantity DECIMAL
);
```

**kiotviet_invoice_payments**
```sql
CREATE TABLE kiotviet_invoice_payments (
  id SERIAL PRIMARY KEY,
  kiotviet_payment_id INTEGER,
  invoice_id INTEGER REFERENCES kiotviet_invoices(id),
  code TEXT,
  amount DECIMAL,
  method TEXT,
  status INTEGER,
  status_value TEXT,
  trans_date TIMESTAMP
);
```

## API Documentation

### Clone Products

**Endpoint:** `POST /api/kiotviet/clone/products`  
**Authentication:** Required (`Authorization: Bearer YOUR_SECRET_TOKEN`)  
**Description:** Clones all products from KiotViet to Supabase  

**Response:**
```json
{
  "success": true,
  "message": "KiotViet products clone completed",
  "data": {
    "productsCount": 150
  }
}
```

### Clone Customers

**Endpoint:** `POST /api/kiotviet/clone/customers`  
**Authentication:** Required (`Authorization: Bearer YOUR_SECRET_TOKEN`)  
**Description:** Clones all customers from KiotViet to Supabase  

**Response:**
```json
{
  "success": true,
  "message": "KiotViet customers clone completed",
  "data": {
    "customersCount": 280
  }
}
```

### Clone All

**Endpoint:** `POST /api/kiotviet/clone/all`  
**Authentication:** Required (`Authorization: Bearer YOUR_SECRET_TOKEN`)  
**Description:** Clones both products and customers from KiotViet to Supabase  

**Response:**
```json
{
  "success": true,
  "message": "KiotViet complete clone (products and customers) completed",
  "data": {
    "productsCount": 150,
    "customersCount": 280
  }
}
```

### Clone Invoices for a Year

**Endpoint:** `POST /api/kiotviet/clone/invoices/:year`  
**Authentication:** Required (`Authorization: Bearer YOUR_SECRET_TOKEN`)  
**Parameters:** 
- `year` - The year to clone invoices for (e.g., 2023)

**Response:**
```json
{
  "success": true,
  "message": "KiotViet invoices for year 2023 clone completed",
  "data": {
    "success": 650,
    "failed": 2,
    "errors": [
      {
        "invoice_id": 12345,
        "code": "HD001234",
        "error": "Error message"
      }
    ]
  }
}
```

### Clone Invoices for a Month

**Endpoint:** `POST /api/kiotviet/clone/invoices/:year/:month`  
**Authentication:** Required (`Authorization: Bearer YOUR_SECRET_TOKEN`)  
**Parameters:** 
- `year` - The year to clone invoices for (e.g., 2023)
- `month` - The month to clone invoices for (1-12)

**Response:**
```json
{
  "success": true,
  "message": "KiotViet invoices for May 2023 clone completed",
  "data": {
    "success": 80,
    "failed": 0,
    "errors": []
  }
}
```

## Batch Processing Details

All data synchronization operations in this service use batch processing to handle large datasets efficiently:

1. **Data Fetching Batches**:
   - Products and customers are fetched in batches of 100 items
   - Each batch retrieval includes progress logging
   - Pagination is handled automatically

2. **Data Import Batches**:
   - Database operations are batched to prevent timeouts and memory issues
   - Each batch of 100 items is processed with detailed logging
   - Small delays are added between batches to prevent database overload

3. **Progress Tracking**:
   - Console logs show detailed progress for each operation
   - Percentage completion is calculated and displayed
   - Error counts are tracked and reported

## Error Handling Strategies

1. **Foreign Key Constraints**:
   - When deleting related data, the service follows proper order to maintain referential integrity
   - Invoice details and payments are deleted before invoices
   - Invoices are deleted before customers

2. **Data Validation**:
   - All incoming data is validated before database operations
   - Null values are handled with appropriate defaults
   - Data type conversion is performed where necessary

3. **Batch Failure Recovery**:
   - If a batch fails, the service continues with the next batch
   - A maximum number of consecutive failures is defined (5) before stopping
   - Detailed error information is collected for reporting

## Testing the Service

1. **Health Check**:
   ```
   GET /
   ```
   Should return: "✅ KiotViet Clone Service is running!"

2. **Clone Products Test**:
   ```bash
   curl -X POST http://localhost:3001/api/kiotviet/clone/products \
     -H "Authorization: Bearer YOUR_SECRET_TOKEN"
   ```

3. **Clone Customers Test**:
   ```bash
   curl -X POST http://localhost:3001/api/kiotviet/clone/customers \
     -H "Authorization: Bearer YOUR_SECRET_TOKEN"
   ```

## Deployment Considerations

1. **Environment Variables**:
   - All sensitive information should be stored in environment variables
   - In production, use a secure method to manage environment variables

2. **Database Indexing**:
   - Ensure proper indexes are created on the Supabase database
   - At minimum, indexes should exist on all foreign key columns and kiotviet_id fields

3. **Memory Requirements**:
   - The service uses batch processing to minimize memory usage
   - For large datasets, ensure the server has at least 1GB of available memory

4. **Logging**:
   - In production, consider implementing a logging service
   - Detailed logs are essential for troubleshooting

## Troubleshooting

### Common Issues

1. **KiotViet Token Expired**:
   - Error: "Authentication failed" or "Invalid token"
   - Solution: Update the KiotViet token in the Supabase system table

2. **Database Connection Issues**:
   - Error: "Could not connect to database"
   - Solution: Check Supabase URL and service key in environment variables

3. **Rate Limiting**:
   - Error: "Too many requests" or "429 Too Many Requests"
   - Solution: Increase the delay between batch operations

4. **Memory Issues**:
   - Error: "JavaScript heap out of memory"
   - Solution: Reduce batch size or increase Node.js memory limit

## Updating KiotViet Token

To update the KiotViet authentication token:

1. Log into your Supabase dashboard
2. Go to the SQL Editor
3. Run the following query:
   ```sql
   UPDATE system
   SET value = 'your_new_token'
   WHERE title = 'kiotviet';
   ```

## Security Considerations

1. Keep your `.env` file secure and never commit it to version control
2. Regularly rotate your authentication tokens
3. Use HTTPS in production
4. Implement rate limiting to prevent abuse

## Support and Contact

For support with this integration, please contact the development team at [your-email@example.com]. 