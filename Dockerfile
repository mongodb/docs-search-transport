FROM node:14-alpine
RUN mkdir -p /app
WORKDIR /app
COPY . /app

ENV NODE_ENV=production
RUN npm ci --production && chown -R node:node /app
USER node

EXPOSE 8080
ENTRYPOINT ["node", "--max-old-space-size=4096", "build/index.js"]
