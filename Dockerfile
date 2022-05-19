FROM node:14-alpine
RUN mkdir -p /app
WORKDIR /app
COPY . .

ENV NODE_ENV=production
RUN npm ci --ignore-scripts && npm run build:clean
RUN chown -R node:node /app
USER node

EXPOSE 8080
ENTRYPOINT ["node", "build/index.js"]