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

- **Query Parameters**:
  - `background` (optional):
    - `false` (default): Shows all categories with clean styling
    - `true`: Shows products in a card-style layout
  - `category` (optional): Filter products by category_id (only used when background=true)
- **Response**: HTML table with categories and prices styled according to the `background` parameter
- **Templates**:
  - `views/templates/price-table-retail.html` (for standard view)
  - `views/templates/price-table-background.html` (for card-style layout)
- **Dimensions**:
  - Card-style layout has a viewport of 1200x1600 with auto-fitting text
  - Optimized for up to 12 records without scrolling
  - Designed for direct rendering or conversion to image using puppeteer
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

## Media Routes for Price Tables

### Generate Price Table Images

```
GET /media/price-table/generate
GET /media/price-table/generate/:category_id
GET /media/price-table/generate?category_id=:category_id
```

Generates price table images for all active categories or a specific category.

- **Parameters**:
  - `category_id` (optional): Generate image for a specific category ID
  - Can be provided as a route parameter `/generate/123` or query parameter `?category_id=123`
- **Response**: Immediate 202 Accepted response with a message that the generation process has started in the background
- **Output**:
  - Creates JPG images in `src/output/` directory
  - Files are named `price-table-category-{category_id}.jpg`
- **Image Dimensions**: Fixed 1200x1600 pixels with 2x device scale factor (high quality)
- **Authentication**: Basic Auth required
- **Processing**: Each category is processed one at a time to avoid memory issues, with all Chrome/Puppeteer instances properly closed between categories

## Database Tables Used

- `kv_products`: Product information
- `kv_product_categories`: Category details and ranking
- `kv_product_inventories`: Product costs
- `kv_pricebooks`: Customer group pricing
- `kv_customers`: Customer information
- `glt_print_jobs`: Print job tracking
- `glt_product_changelogs`: Product change history

## Environment Variables Required

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
