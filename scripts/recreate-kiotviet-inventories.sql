-- Recreate kiotviet_inventories table
-- Run this script in your database tool or psql

-- Drop existing table if needed (be careful with this in production!)
-- DROP TABLE IF EXISTS public.kiotviet_inventories;

-- Create the table
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_kiotviet_inventories_product_id 
  ON public.kiotviet_inventories USING btree (product_id);

CREATE INDEX IF NOT EXISTS idx_kiotviet_inventories_branch_id 
  ON public.kiotviet_inventories USING btree (branch_id);

-- Example insert based on the provided data structure
-- INSERT INTO public.kiotviet_inventories (
--   product_id, kiotviet_product_id, product_code, product_name, branch_id, branch_name,
--   cost, on_hand, reserved, actual_reserved, min_quantity, max_quantity, is_active, on_order
-- ) VALUES (
--   (SELECT id FROM kiotviet_products WHERE kiotviet_id = 3065552), -- Get the product ID reference
--   3065552, '2021101', '504', 15132, 'Gạo Lâm Thúy',
--   14300.0000000000, -1526.539, 0, 0, 0, 0, true, 0
-- ); 