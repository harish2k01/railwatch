FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
# npm registry for this build only (homelab CI passes Verdaccio); not kept in the final image.
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
RUN npm ci --ignore-scripts

FROM node:24-alpine AS builder
WORKDIR /app
ARG APP_VERSION=development
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_APP_VERSION=$APP_VERSION
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ARG APP_VERSION=development
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_APP_VERSION=$APP_VERSION \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apk add --no-cache libc6-compat openssl && chown node:node /app
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/build/backend ./build/backend
COPY --from=builder --chown=node:node /app/scripts/start-service.mjs ./scripts/start-service.mjs
USER node
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "const port=process.env.RAILWATCH_SERVICE==='backend'?(process.env.BACKEND_PORT||3001):(process.env.PORT||3000);fetch('http://127.0.0.1:'+port+'/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-service.mjs"]
