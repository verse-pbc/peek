# Build stage
FROM node:20-alpine as builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY package.json ./

# Copy shared workspace
COPY shared ./shared

# Copy pwa-client package files
COPY packages/pwa-client/package.json ./packages/pwa-client/
COPY packages/pwa-client ./packages/pwa-client

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build arguments for Vite environment variables
ARG VITE_RELAY_URL=wss://communities2.nos.social
ARG VITE_VALIDATION_SERVICE_PUBKEY=npub1de8w8ur3drv89rtezsw0j32hq4wvv05qarsrdvxw75vvp9w35zdswz2tsq
ARG VITE_DEV_MODE=false
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_KEY
ARG VITE_PUSH_SERVICE_NPUB
ARG VITE_APP_NAME=peek

# Build the application with environment variables
WORKDIR /app/packages/pwa-client
ENV VITE_RELAY_URL=${VITE_RELAY_URL}
ENV VITE_VALIDATION_SERVICE_PUBKEY=${VITE_VALIDATION_SERVICE_PUBKEY}
ENV VITE_DEV_MODE=${VITE_DEV_MODE}
ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}
ENV VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}
ENV VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
ENV VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}
ENV VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}
ENV VITE_FIREBASE_VAPID_KEY=${VITE_FIREBASE_VAPID_KEY}
ENV VITE_PUSH_SERVICE_NPUB=${VITE_PUSH_SERVICE_NPUB}
ENV VITE_APP_NAME=${VITE_APP_NAME}
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY packages/pwa-client/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder
COPY --from=builder /app/packages/pwa-client/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost || exit 1

CMD ["nginx", "-g", "daemon off;"]