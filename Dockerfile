# Use minimal node image
FROM node:20-slim

# Set timezone
ENV TZ=Asia/Ho_Chi_Minh

# Optional: install tzdata to allow timezones
RUN apt-get update && apt-get install -y tzdata && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

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
