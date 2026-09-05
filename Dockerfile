# Single image: builds the React front end and the API, then serves both.
# server/src/index.ts serves ../../dist when it exists, so no separate web
# container or reverse proxy is needed for a self-hosted install.

FROM node:24-slim AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim AS api
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build

FROM node:24-slim AS runner
# openssl is a Prisma runtime dependency on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=api /app/server/node_modules ./server/node_modules
COPY --from=api /app/server/dist ./server/dist
COPY --from=api /app/server/package.json ./server/package.json
COPY --from=api /app/server/prisma ./server/prisma
COPY --from=api /app/server/src ./server/src
COPY --from=web /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/

RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
EXPOSE 4000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
