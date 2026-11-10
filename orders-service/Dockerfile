FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
RUN mkdir -p /data && chown -R node:node /app /data

USER node
EXPOSE 8091
CMD ["node", "src/index.js"]
