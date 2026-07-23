# Using a standard, guaranteed-to-exist Node.js base image instead of pinning
# to a Playwright-specific tag (mcr.microsoft.com/playwright/node:20-jammy
# turned out not to exist — that was the cause of the build failure).
# Playwright installs its own browser + OS dependencies at build time below,
# so we don't depend on Microsoft publishing an exact matching image tag.
FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies first (cached layer — faster rebuilds later)
COPY package*.json ./
RUN npm ci --omit=dev

# Install Chromium + all required OS-level dependencies for it to run headless
RUN npx playwright install --with-deps chromium

# Copy the rest of the source code
COPY . .

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "src/index.js"]
