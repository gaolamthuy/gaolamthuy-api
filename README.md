# KiotViet Clone Service

A Node.js service to synchronize data from KiotViet to Supabase.

## Features

- Clone products from KiotViet to Supabase
- Clone customers from KiotViet to Supabase
- Secure API endpoints with API key authentication
- Clean code structure for maintainability

## Project Structure

```
├── src/
│   ├── controllers/      # Request handlers
│   ├── services/         # Business logic
│   ├── routes/           # API route definitions  
│   ├── middlewares/      # Middleware functions
│   ├── utils/            # Utility functions
│   ├── app.js            # Express application setup
│   └── server.js         # Server initialization
├── index.js              # Application entry point
├── .env                  # Environment variables
└── package.json          # Project dependencies
```

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   PORT=3000
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_key
   KIOTVIET_BASE_URL=your_kiotviet_api_url
   YOUR_SECRET_TOKEN=your_api_key
   ```
4. Start the server:
   ```
   npm start
   ```

## API Endpoints

All endpoints require the `x-api-key` header to be set with your API key.

### Clone Products

```
POST /api/kiotviet/clone/products
```

Clones all products and their inventory from KiotViet to Supabase.

### Clone Customers

```
POST /api/kiotviet/clone/customers
```
```
POST /api/kiotviet/clone/invoices/2025
```

Clones all customers from KiotViet to Supabase.

### Clone All

```
POST /api/kiotviet/clone/all
```

Clones both products and customers from KiotViet to Supabase.

## Running with Docker

```
docker-compose up -d
```

## License

This project is proprietary software. 