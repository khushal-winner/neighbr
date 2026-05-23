# Use this if Render Node build cannot compile Go (recommended for neighbr-all).
FROM node:20-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci --include=dev
RUN npm run build:deploy-all

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "apps/deploy/all/dist/index.js"]
