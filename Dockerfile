# Stage 1: Build the NestJS app
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
# Install only production dependencies and clean cache
RUN npm ci --only=production && npm cache clean --force

# Copy compiled dist directory from builder
COPY --from=builder /usr/src/app/dist ./dist

# Expose NestJS port
EXPOSE 3000

CMD ["node", "dist/main"]