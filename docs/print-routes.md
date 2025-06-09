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

#### Wholesale Price Table

```
GET /print/price-table/whole
```

Displays all active products with wholesale prices (cost + 800).

- **Query Parameters**:
  - `background` (optional):
    - `false` (default): Shows all products in clean table format
    - `true`: Shows products in card-style layout (original behavior)
  - `category_name` (optional): Filter products by category name
- **Response**: HTML table with product names, descriptions, and wholesale prices
- **Templates**:
  - `views/templates/price-table-whole.html` (for clean view)
  - `views/templates/price-table-whole-background.html` (for card-style layout)
- **Sorting**: By category rank, then by inventory cost
- **Price**: Wholesale Price = `cost + 800`
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

#### Generate Retail Price Table Images (NEW)

```
GET /media/price-table/generate/retail
```

Generates retail price table images using card-style layout for all active categories.

- **Response**: JSON with generation results including success/failure counts
- **Output**:
  - Creates JPEG images in `src/output/` directory
  - Files are named `price-table-retail-{category_id}.jpeg`
  - Uses `/print/price-table/retail?background=true&category={categoryId}` for each category
- **Image Dimensions**: 1200x1600 pixels with 2x device scale factor (high quality)
- **Authentication**: Basic Auth required
- **Processing**: Each category processed separately with card-style layout

#### Generate Wholesale Price Table Images (NEW)

```
GET /media/price-table/generate/whole
```

Generates wholesale price table image using clean layout with all products.

- **Response**: JSON with generation results
- **Output**:
  - Creates JPEG image in `src/output/` directory
  - File named `price-table-wholesale-all.jpeg`
  - Uses `/print/price-table/whole` (captures full page with all categories and products)
- **Image Dimensions**: 1200x2400+ pixels (dynamic height for full page capture)
- **Authentication**: Basic Auth required
- **Processing**: Single comprehensive image with all products and category headers

#### Generate All Price Table Images (DEPRECATED)

```
GET /media/price-table/generate
```

Generates price table images for all active categories (legacy format).

- **Status**: DEPRECATED - Use the new separate retail/wholesale endpoints instead
- **Output**: Creates JPG images in `src/output/` directory with legacy naming
- **Authentication**: Basic Auth required

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
