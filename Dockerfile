FROM node:20-slim

# Set timezone
ENV TZ=Asia/Ho_Chi_Minh

# Install Chromium dependencies for Puppeteer + tzdata
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    libxss1 \
    libappindicator3-1 \
    libxshmfence1 \
    lsb-release \
    libnss3-tools \
    libxext6 \
    libxi6 \
    libxtst6 \
    tzdata \
    --no-install-recommends \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app files
COPY . .

# Expose port (set default if not provided)
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

# Healthcheck endpoint (optional)
HEALTHCHECK CMD curl --fail http://localhost:${PORT}/healthz || exit 1

# Start app
CMD ["node", "index.js"]
