FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

# Default: run proxy-checker. Override via docker-compose command.
CMD ["node", "proxy-checker/index.js"]
