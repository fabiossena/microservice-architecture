FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY src ./src
COPY public ./public
RUN chown -R node:node /app

USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
