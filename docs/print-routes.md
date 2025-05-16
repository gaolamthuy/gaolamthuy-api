# Print Routes Documentation

## Overview
The print routes handle various printing functionalities including price boards, price tables, invoices, and product labels. All routes are prefixed with `/print`.

## Routes

### Price Board
```
GET /print/price-board
```
Generates a single product price display in A6 landscape format.
- **Query Parameters**: 
  - `product_id` or `kiotviet_product_id` (required)
- **Response**: HTML page showing product name and price
- **Template**: `views/templates/price-board.html`
- **Auth**: None required

### Price Tables

#### Retail & Wholesale Price Table
```
GET /print/price-table/retail
```
Displays all active products with retail and wholesale prices.
- **Response**: HTML table with categories and prices
- **Template**: `views/templates/price-table-retail.html`
- **Sorting**: By category rank, then by inventory cost
- **Prices**:
  - Retail Price = `base_price`
  - Wholesale Price = `inventory_cost + 2000`
- **Auth**: None required

#### Customer-Specific Price Table
```
GET /print/price-table/:kiotviet_customer_id
```
Shows customer-specific pricing based on their group and applicable pricebooks.
- **Parameters**: 
  - `kiotviet_customer_id` (required)
- **Template**: `views/templates/price-table.html`
- **Auth**: Basic Authentication required

### Changelog
```
GET /print/changelog
```
Shows product changes for a specific date.
- **Query Parameters**:
  - `date` (required): Format dd/mm/yyyy
  - `field_change` (required): Array of fields to show changes for
    - Valid values: `base_price`, `cost`, `order_template`, `description`
  - `output_type` (optional): `html` (default) or `plain`
- **Response**: HTML page or plain text showing changes grouped by category
- **Template**: `views/templates/changelog.html`
- **Format**:
  - For price changes: `Product Name New_Price (tăng/giảm Price_Diff từ Old_Price)`
  - For text changes: `Product Name (Old_Value → New_Value)`
- **Auth**: None required

### Print Jobs

#### List Pending Jobs
```
GET /print/jobs?print_agent_id=<id>
```
- **Auth**: Basic Authentication required

#### Create Print Job
```
POST /print/jobs
```
- **Body**: `{ doc_ref, doc_type, print_agent_id }`
- **Auth**: Basic Authentication required

#### Update Job Status
```
PUT /print/jobs/:id
```
- **Body**: `{ status }`
- **Auth**: Basic Authentication required

### Other Print Routes

#### Invoice Print
```
GET /print/kv-invoice?code=<invoice_code>
```
- **Auth**: None required

#### Product Label Print
```
GET /print/label-product?code=<product_code>&quantity=<qty>
```
- **Auth**: None required

## Database Tables Used
- `kv_products`: Product information
- `kv_product_categories`: Category details and ranking
- `kv_product_inventories`: Product costs
- `kv_pricebooks`: Customer group pricing
- `kv_customers`: Customer information
- `glt_print_jobs`: Print job tracking
- `glt_product_changelog`: Product change history

## Environment Variables Required
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` 