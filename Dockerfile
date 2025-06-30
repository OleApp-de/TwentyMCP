# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 3000

# Traefik labels for SSE support
LABEL traefik.enable=true
LABEL traefik.http.services.twenty-mcp.loadbalancer.server.port=3000
LABEL traefik.http.services.twenty-mcp.loadbalancer.server.buffering=false
LABEL traefik.http.routers.twenty-mcp.timeout.read=86400s
LABEL traefik.http.routers.twenty-mcp.timeout.write=86400s

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server with SSE transport (better for Claude)
CMD ["node", "dist/index.js", "sse"] 