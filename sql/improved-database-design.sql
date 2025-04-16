-- Thiết kế cơ sở dữ liệu cải tiến cho KiotViet Integration

-- Cấu trúc bảng products
CREATE TABLE public.kiotviet_products (
  id BIGSERIAL PRIMARY KEY,
  kiotviet_id BIGINT UNIQUE NOT NULL,
  retailer_id BIGINT,
  code VARCHAR(255),
  bar_code VARCHAR(255),
  name VARCHAR(255),
  full_name VARCHAR(255),
  category_id BIGINT,
  category_name VARCHAR(255),
  allows_sale BOOLEAN,
  type INTEGER,
  has_variants BOOLEAN,
  base_price NUMERIC(20, 6),
  weight NUMERIC(20, 6),
  unit VARCHAR(255),
  master_product_id BIGINT,
  master_unit_id BIGINT,
  conversion_value INTEGER,
  description TEXT,
  modified_date TIMESTAMP WITHOUT TIME ZONE,
  created_date TIMESTAMP WITHOUT TIME ZONE,
  is_active BOOLEAN,
  order_template VARCHAR(255),
  is_lot_serial_control BOOLEAN,
  is_batch_expire_control BOOLEAN,
  trade_mark_name VARCHAR(255),
  trade_mark_id BIGINT,
  images TEXT[]
);

CREATE INDEX idx_product_category ON public.kiotviet_products USING btree (category_id);
CREATE INDEX idx_kiotviet_products_kiotviet_id ON public.kiotviet_products USING btree (kiotviet_id);

-- Cấu trúc bảng khách hàng
CREATE TABLE public.kiotviet_customers (
  id BIGSERIAL PRIMARY KEY,
  kiotviet_id BIGINT UNIQUE NOT NULL,
  code TEXT,
  name TEXT,
  retailer_id BIGINT,
  branch_id BIGINT,
  location_name TEXT,
  ward_name TEXT,
  modified_date TIMESTAMP WITHOUT TIME ZONE,
  created_date TIMESTAMP WITHOUT TIME ZONE,
  type INTEGER,
  groups TEXT,
  debt NUMERIC(12, 4),
  contact_number TEXT,
  comments TEXT,
  address TEXT
);

CREATE INDEX idx_kiotviet_customers_kiotviet_id ON public.kiotviet_customers USING btree (kiotviet_id);

-- Cấu trúc bảng hóa đơn
CREATE TABLE public.kiotviet_invoices (
  id BIGSERIAL PRIMARY KEY,
  kiotviet_id BIGINT UNIQUE NOT NULL,
  uuid TEXT,
  code TEXT,
  purchase_date TIMESTAMP WITHOUT TIME ZONE,
  branch_id BIGINT,
  branch_name TEXT,
  sold_by_id BIGINT,
  sold_by_name TEXT,
  kiotviet_customer_id BIGINT, -- ID từ KiotViet
  customer_id BIGINT, -- Reference to local customer
  customer_code TEXT,
  customer_name TEXT,
  order_code TEXT,
  total NUMERIC(12, 4),
  total_payment NUMERIC(12, 4),
  status INTEGER,
  status_value TEXT,
  using_cod BOOLEAN,
  created_date TIMESTAMP WITHOUT TIME ZONE,
  CONSTRAINT fk_kiotviet_invoices_customer FOREIGN KEY (customer_id) REFERENCES kiotviet_customers(id)
);

CREATE INDEX idx_kiotviet_invoices_purchase_date ON public.kiotviet_invoices USING btree (purchase_date);
CREATE INDEX idx_kiotviet_invoices_kiotviet_id ON public.kiotviet_invoices USING btree (kiotviet_id);

-- Cấu trúc bảng chi tiết hóa đơn
CREATE TABLE public.kiotviet_invoice_details (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL,
  kiotviet_product_id BIGINT, -- ID sản phẩm từ KiotViet
  product_id BIGINT, -- Reference to local product
  product_code TEXT,
  product_name TEXT,
  category_id BIGINT,
  category_name TEXT,
  quantity NUMERIC(12, 4),
  price NUMERIC(12, 4),
  discount NUMERIC(12, 4),
  sub_total NUMERIC(12, 4),
  note TEXT,
  serial_numbers TEXT,
  return_quantity NUMERIC(12, 4),
  CONSTRAINT fk_kiotviet_invoice_details_invoice FOREIGN KEY (invoice_id) REFERENCES kiotviet_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_kiotviet_invoice_details_product FOREIGN KEY (product_id) REFERENCES kiotviet_products(id)
);

CREATE INDEX idx_kiotviet_invoice_details_invoice_id ON public.kiotviet_invoice_details USING btree (invoice_id);

-- Cấu trúc bảng thanh toán hóa đơn
CREATE TABLE public.kiotviet_invoice_payments (
  id BIGSERIAL PRIMARY KEY,
  kiotviet_payment_id BIGINT, -- ID thanh toán từ KiotViet
  invoice_id BIGINT NOT NULL,
  code TEXT,
  amount NUMERIC(12, 4),
  method TEXT,
  status INTEGER,
  status_value TEXT,
  trans_date TIMESTAMP WITHOUT TIME ZONE,
  CONSTRAINT fk_kiotviet_invoice_payments_invoice FOREIGN KEY (invoice_id) REFERENCES kiotviet_invoices(id) ON DELETE CASCADE
);

CREATE INDEX idx_kiotviet_invoice_payments_invoice_id ON public.kiotviet_invoice_payments USING btree (invoice_id); 