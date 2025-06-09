# Price Table Generation System

## Overview

The price table generation system creates JPEG images of price tables for all active product categories. The system has been improved with better error handling, retry logic, monitoring capabilities, and separation of concerns.

## Architecture

### Components

1. **`priceTableService.js`** - Core business logic service
2. **`mediaController.js`** - HTTP endpoint wrapper
3. **Server cron jobs** - Automated scheduling
4. **Health monitoring** - Status and health check endpoints

### Key Improvements

- ✅ **Separated business logic from HTTP controllers**
- ✅ **Added concurrency protection** (prevents multiple simultaneous runs)
- ✅ **Implemented retry logic** with exponential backoff
- ✅ **Enhanced error handling and logging**
- ✅ **Added health checks and monitoring**
- ✅ **Improved Puppeteer configuration** for better reliability
- ✅ **Better structured logging** with timestamps and context

## Usage

### HTTP Endpoints

#### Generate Price Tables

```
GET /api/media/price-table/generate
```

Triggers batch generation of price table images for all active categories.

**Response:**

```json
{
  "success": true,
  "message": "Price table image generation process completed",
  "totalCategories": 15,
  "successCount": 30,
  "failureCount": 0,
  "duration": 45000,
  "results": [...]
}
```

#### Check Service Status

```
GET /api/media/price-table/status
```

Returns the current status and health of the price table generation service.

**Response:**

```json
{
  "success": true,
  "isGenerating": false,
  "lastRunTimestamp": "2024-01-15T10:30:00.000Z",
  "lastRunResults": {...},
  "health": {
    "service": "priceTableService",
    "status": "healthy",
    "isGenerating": false,
    "lastRunTimestamp": "2024-01-15T10:30:00.000Z",
    "uptimeSeconds": 3600
  }
}
```

### Cron Jobs

The system runs two scheduled tasks:

1. **Daily KiotViet Sync** (2 AM) - Includes price table generation
2. **Standalone Price Table Generation** (3 AM) - Backup/redundant generation

### Manual Testing

Use the test script for manual testing:

```bash
node src/scripts/test-price-table-generation.js
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3001)
- `TIMEZONE` - Cron job timezone (default: UTC)
- `SUPABASE_URL` - Supabase database URL
- `SUPABASE_SERVICE_KEY` - Supabase service key
- S3/CDN configuration for image storage

### Retry Configuration

- **Max Retries:** 3 attempts per image
- **Backoff Strategy:** Exponential (2^attempt × 1000ms)
- **Timeouts:** 45 seconds for page load, 30 seconds for navigation

## Monitoring

### Health Checks

The service provides health status based on:

- Current generation state
- Last run timestamp
- Success/failure rates
- Service uptime

### Status Codes

- `healthy` - Service is operating normally
- `warning` - Service has issues (e.g., no recent runs, high failure rate)

### Logging

All operations are logged with:

- Timestamps
- Context prefixes ([CRON], [HTTP])
- Progress indicators
- Detailed error information
- Performance metrics

## Error Handling

### Concurrent Run Protection

- Only one generation process can run at a time
- Subsequent requests return HTTP 409 (Conflict)
- Prevents resource conflicts and duplicate work

### Retry Logic

- Failed screenshots are retried up to 3 times
- Exponential backoff prevents overwhelming the system
- Individual category failures don't stop the entire batch

### Graceful Degradation

- Service continues processing other categories if one fails
- Detailed error reporting for each category
- Comprehensive result summaries

## File Structure

```
src/
├── services/
│   └── priceTableService.js      # Core business logic
├── controllers/
│   └── mediaController.js        # HTTP endpoints
├── routes/
│   └── mediaRoutes.js            # Route definitions
├── scripts/
│   └── test-price-table-generation.js  # Manual testing
└── server.js                     # Cron job scheduling
```

## Troubleshooting

### Common Issues

1. **Generation Already in Progress**

   - Check `/api/media/price-table/status`
   - Wait for current generation to complete

2. **High Failure Rate**

   - Check server logs for specific errors
   - Verify print endpoints are accessible
   - Check S3 upload permissions

3. **Timeout Errors**
   - Increase timeout values in service
   - Check server performance and resources

### Debug Commands

```bash
# Check service status
curl http://localhost:3001/api/media/price-table/status

# Manual generation test
node src/scripts/test-price-table-generation.js

# Check logs for cron job activity
# Look for [CRON] prefixed messages
```

## Performance

### Optimization Features

- Optimized Puppeteer launch arguments
- Proper browser cleanup (finally blocks)
- Temporary file cleanup
- Efficient batch processing

### Expected Performance

- ~2-3 seconds per image (retail + wholesale)
- ~15-30 categories typical processing time: 1-2 minutes
- Memory usage: ~100-200MB during generation

## Future Improvements

- [ ] Add Discord notifications for failures
- [ ] Implement image comparison to skip unchanged categories
- [ ] Add metrics collection (Prometheus/Grafana)
- [ ] Queue-based processing for high-volume scenarios
- [ ] WebSocket real-time status updates
