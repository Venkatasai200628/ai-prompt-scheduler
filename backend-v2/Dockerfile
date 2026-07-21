FROM mcr.microsoft.com/playwright/node:20-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install chromium --with-deps
COPY . .
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "src/index.js"]
