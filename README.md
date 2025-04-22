# Gao Lam Thuy Internal Service

This internal service handles various backend operations for Gao Lam Thuy:

- Media file uploads and management
- KiotViet data synchronization
- Product and category management

## Project Structure

```
├── src/
│   ├── controllers/     # Request handlers
│   ├── middlewares/     # Express middleware
│   ├── routes/          # API route definitions
│   ├── services/        # Business logic and external API integration
│   ├── utils/           # Utility functions
│   ├── app.js           # Express configuration
│   └── server.js        # HTTP server and scheduled tasks
├── scripts/             # Utility scripts
│   └── test-db-connection.js
├── uploads/             # Uploaded files directory
├── .env                 # Environment variables
├── .env.example         # Example environment file
├── index.js             # Application entry point
└── package.json         # Dependencies and scripts
```

## Key Files

- **mediaRoutes.js**: Media upload and handling routes
- **refreshKiotVietToken.js**: Utility to refresh the KiotViet API token
- **test-db-connection.js**: Script to test the Supabase database connection

## Environment Variables

The application uses environment variables for configuration. Copy `.env.example` to `.env` and configure:

```
# KiotViet API
KIOTVIET_BASE_URL=https://id.kiotviet.vn
KIOTVIET_PUBLIC_API_URL=https://public.kiotapi.com
KIOTVIET_CLIENT_ID=your-client-id
KIOTVIET_CLIENT_SECRET=your-client-secret
KIOTVIET_RETAILER=your-retailer-name

# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key

# S3 Storage
S3_BUCKET_NAME=your-bucket-name
CDN_ENDPOINT=your-cdn-url
S3_ENDPOINT=your-s3-endpoint
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_REGION=auto

# Authentication
MEDIA_AUTH_USER=username
MEDIA_AUTH_PASS=password

# Other
PORT=3001
```

## Setup and Running

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables by copying `.env.example` to `.env` and configuring it.

3. Run the application:
   ```
   npm start
   ```

4. For development with auto-restart:
   ```
   npm run dev
   ```

## Database Connection Test

Test the database connection with:

```
node scripts/test-db-connection.js
```

## KiotViet Token Refresh

Refresh the KiotViet token manually with:

```
node src/utils/refreshKiotVietToken.js
```

This should also be scheduled to run daily with a cron job. 