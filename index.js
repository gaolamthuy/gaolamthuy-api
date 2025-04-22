/**
 * Gao Lam Thuy Internal Service
 * 
 * This is the main entry point for the application.
 * The server handles:
 * - Media file uploads and management
 * - KiotViet data synchronization
 * - Product and category management
 * 
 * The main components are:
 * - src/app.js: Express application configuration
 * - src/server.js: HTTP server and scheduled tasks
 * - src/routes: API route definitions
 * - src/controllers: Business logic for routes
 * - src/services: Core services and external API integrations
 * - src/utils: Utility functions, including KiotViet token refresh
 */
require('./src/server');
