# build stage
FROM node:18-alpine as builder
WORKDIR /app

COPY package*.json tsconfig*.json ./
RUN npm ci
COPY . ./
RUN npm run build

# main image
FROM node:18-alpine as main
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY --from=builder /app/build ./build
COPY --from=builder /app/resources ./resources

EXPOSE 8080
ENTRYPOINT ["node", "build/index.js", "--create-indexes" ,"--load-manifests"]