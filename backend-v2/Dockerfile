# Official Playwright image — has Chromium + all system deps pre-installed
FROM mcr.microsoft.com/playwright/node:20-jammy

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev

# Install Chromium browser
RUN npx playwright install chromium --with-deps

# Copy source
COPY . .

# Create data directory for SQLite database
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/index.js"]
