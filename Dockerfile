FROM node:14-alpine
RUN mkdir -p /app
WORKDIR /app
COPY package.json /app
COPY package-lock.json* /app
RUN npm install

ENV NODE_ENV=production
RUN chown -R node:node /app
USER node

RUN npm run build
EXPOSE 8080
ENTRYPOINT ["node", "build/index.js"]
