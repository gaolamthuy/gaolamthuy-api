# Hướng dẫn tích hợp KiotViet với Supabase

## 1. Giới thiệu

Tài liệu này hướng dẫn cách thiết lập và sử dụng hệ thống tích hợp dữ liệu từ KiotViet vào Supabase. Hệ thống này cho phép bạn sao chép dữ liệu sản phẩm, khách hàng và hóa đơn từ KiotViet vào cơ sở dữ liệu Supabase của bạn để sử dụng cho mục đích báo cáo, phân tích, hoặc xây dựng các ứng dụng bổ sung.

## 2. Thiết lập cơ sở dữ liệu

### Bước 1: Tạo cấu trúc bảng trong Supabase

Chạy script SQL trong file `sql/improved-database-design.sql` để tạo các bảng cần thiết. Script này sẽ tạo các bảng sau:

- `kiotviet_products`: Lưu thông tin sản phẩm
- `kiotviet_customers`: Lưu thông tin khách hàng
- `kiotviet_invoices`: Lưu thông tin hóa đơn
- `kiotviet_invoice_details`: Lưu thông tin chi tiết hóa đơn
- `kiotviet_invoice_payments`: Lưu thông tin thanh toán hóa đơn

### Bước 2: Cấu hình biến môi trường

Tạo file `.env` với các thông tin sau:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
KIOTVIET_BASE_URL=https://public.kiotapi.com
PORT=3000
```

## 3. Các API Endpoint

Hệ thống cung cấp các endpoint sau:

1. **Clone sản phẩm**: `POST /api/kiotviet/clone/products`
   - Sao chép tất cả sản phẩm từ KiotViet vào Supabase

2. **Clone khách hàng**: `POST /api/kiotviet/clone/customers`
   - Sao chép tất cả khách hàng từ KiotViet vào Supabase

3. **Clone hóa đơn theo năm**: `POST /api/kiotviet/clone/invoices/:year`
   - Sao chép hóa đơn từ KiotViet vào Supabase cho năm cụ thể
   - Ví dụ: `POST /api/kiotviet/clone/invoices/2025`

4. **Clone hóa đơn theo tháng**: `POST /api/kiotviet/clone/invoices/:year/:month`
   - Sao chép hóa đơn từ KiotViet vào Supabase cho tháng cụ thể trong một năm
   - Ví dụ: `POST /api/kiotviet/clone/invoices/2025/01` (clone tháng 1 năm 2025)

5. **Clone tất cả**: `POST /api/kiotviet/clone/all`
   - Sao chép sản phẩm và khách hàng từ KiotViet vào Supabase

## 4. Quy trình sử dụng

### Quy trình đề xuất

1. **Trước tiên, clone sản phẩm và khách hàng**:
   ```
   POST /api/kiotviet/clone/all
   ```

2. **Sau đó, clone hóa đơn**:

   - **Theo năm**:
     ```
     POST /api/kiotviet/clone/invoices/2025
     ```
     
   - **Hoặc theo tháng cụ thể** (khuyến nghị để tránh timeout và lỗi):
     ```
     POST /api/kiotviet/clone/invoices/2025/01  # Tháng 1
     POST /api/kiotviet/clone/invoices/2025/02  # Tháng 2
     ...
     ```

### Lưu ý

- Quá trình clone hóa đơn có thể mất thời gian nếu có nhiều dữ liệu
- Hệ thống có cơ chế chống rate limit từ KiotViet (thêm delay giữa các request)
- Dữ liệu sản phẩm và khách hàng nên được clone trước khi clone hóa đơn để đảm bảo các khóa ngoại hoạt động đúng
- Đối với dữ liệu lớn, nên clone theo từng tháng thay vì theo cả năm

## 5. Giải thích cấu trúc dữ liệu

### Quản lý ID

Hệ thống sử dụng hai loại ID:

1. **Local ID**: ID tự động tăng trong Supabase 
   - Sử dụng làm khóa chính trong mỗi bảng
   - Được tạo tự động khi thêm bản ghi mới

2. **KiotViet ID**: ID của đối tượng trong KiotViet
   - Được lưu trong trường `kiotviet_id`
   - Dùng để ánh xạ giữa dữ liệu Supabase và KiotViet

### Mối quan hệ giữa các bảng

- `kiotviet_invoices -> kiotviet_customers`: Mỗi hóa đơn thuộc về một khách hàng
- `kiotviet_invoice_details -> kiotviet_invoices`: Mỗi chi tiết hóa đơn thuộc về một hóa đơn
- `kiotviet_invoice_details -> kiotviet_products`: Mỗi chi tiết hóa đơn tham chiếu đến một sản phẩm
- `kiotviet_invoice_payments -> kiotviet_invoices`: Mỗi thanh toán thuộc về một hóa đơn

## 6. Xử lý sự cố

### Lỗi liên quan đến khóa ngoại

Nếu gặp lỗi về khóa ngoại, đảm bảo rằng:

1. Đã clone sản phẩm và khách hàng trước khi clone hóa đơn
2. Cấu trúc bảng đã được tạo đúng theo `sql/improved-database-design.sql`

### Lỗi rate limit

Nếu gặp lỗi rate limit từ KiotViet:

1. Tăng thời gian delay giữa các request trong file `src/services/kiotvietService.js`
2. Giảm số lượng request đồng thời bằng cách giảm pageSize

### Lỗi timeout hoặc bộ nhớ không đủ

Nếu gặp lỗi timeout khi clone cả năm:

1. Sử dụng endpoint clone theo từng tháng thay vì cả năm
2. Thực hiện clone tuần tự từng tháng

## 7. Bảo trì

### Cập nhật dữ liệu định kỳ

Để dữ liệu luôn được cập nhật, bạn nên lên lịch chạy các endpoint clone theo định kỳ:

1. Hàng ngày: clone sản phẩm và khách hàng
2. Hàng ngày: clone hóa đơn cho tháng hiện tại 