FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies only when package.json changes
FROM base AS deps
COPY package.json ./
RUN npm ci --only=production

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create upload directories
RUN mkdir -p uploads/temp

# Production image, copy all the files and run the app
FROM base AS runner

ENV NODE_ENV production
# Uncomment the following line to enable source map support
# ENV NODE_OPTIONS --enable-source-maps

# Set proper permissions
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser
USER nodeuser

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/uploads ./uploads
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.js ./

# Make sure upload directories exist and are writable
RUN mkdir -p uploads/temp && chmod -R 755 uploads

# Expose the port the app runs on
EXPOSE 3000

CMD ["node", "index.js"]
