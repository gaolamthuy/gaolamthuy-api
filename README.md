# Gao Lam Thuy Internal Service

![KiotViet Integration](https://img.shields.io/badge/KiotViet-Integration-blue)
![Node.js](https://img.shields.io/badge/Node.js-v14+-green)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey)
![Supabase](https://img.shields.io/badge/Supabase-Database-orange)

A Node.js service for syncing data between KiotViet and Supabase for Gao Lam Thuy.

## 📋 Features

- **Product Data Sync**: Clone all products from KiotViet to Supabase
- **Customer Data Sync**: Clone customer information with pagination
- **Invoice Data Sync**: Clone invoices by year or month
- **API Endpoints**: RESTful API for data synchronization
- **Batch Processing**: Process large datasets in manageable batches
- **Progress Tracking**: Detailed logging of sync progress

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm/yarn
- Supabase account and project
- KiotViet API credentials

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/gaolamthuy-internal-service.git
   cd gaolamthuy-internal-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables by creating a `.env` file:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   KIOTVIET_BASE_URL=https://public.kiotapi.com
   YOUR_SECRET_TOKEN=your_authentication_token
   PORT=3001
   ```

4. Start the service:
   ```bash
   npm start
   ```

## 🔑 Authentication

All API endpoints are protected with token-based authentication. Include the token in your request headers:

```
Authorization: Bearer YOUR_SECRET_TOKEN
```

## 🌐 API Endpoints

### Products

Clone all products from KiotViet:
```
POST /api/kiotviet/clone/products
```

### Customers

Clone all customers from KiotViet:
```
POST /api/kiotviet/clone/customers
```

### Clone All Data

Clone both products and customers:
```
POST /api/kiotviet/clone/all
```

### Invoices

Clone invoices for a specific year:
```
POST /api/kiotviet/clone/invoices/:year
```

Clone invoices for a specific month in a year:
```
POST /api/kiotviet/clone/invoices/:year/:month
```

## 🛠️ Tech Stack

- **Node.js**: JavaScript runtime
- **Express**: Web framework
- **Supabase**: Database and backend services
- **Axios**: HTTP client
- **Dotenv**: Environment variables

## 📈 Batch Processing

The service implements batch processing with detailed progress tracking:

- Products and customers are processed in batches of 100 items
- Progress indicators show percentage completion for each stage
- Console logs provide detailed information about the synchronization process

## 🔄 Database Structure

### KiotViet Tables

- `kiotviet_products`: Store product information
- `kiotviet_customers`: Store customer data
- `kiotviet_invoices`: Store invoice headers
- `kiotviet_invoice_details`: Store invoice line items
- `kiotviet_invoice_payments`: Store invoice payment information

## 🧪 Error Handling

The service includes robust error handling:

- Each sync operation has error tracking
- Failed operations are logged with detailed error messages
- The system attempts to continue processing despite individual failures

## 📝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## 📄 License

This project is proprietary software for Gao Lam Thuy.

## 📞 Support

For support or questions, please contact the development team. 