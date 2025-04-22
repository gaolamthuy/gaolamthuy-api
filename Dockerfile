# Use minimal node image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install --production

# Copy app files
COPY . .

# Expose port (match your Express port)
EXPOSE ${PORT}

# Start app
CMD ["node", "index.js"]
