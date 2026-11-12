# Printer Door Monitor: one small Node process, no build step.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8790 DATA_DIR=/data
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY server/public ./public
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8790/healthz >/dev/null || exit 1
CMD ["node", "src/server.mjs"]
