# Stage 1: Build the NestJS app
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled dist directory from builder
COPY --from=builder /usr/src/app/dist ./dist

# Expose NestJS port (adjust if your main.ts uses a different port)
EXPOSE 3000

CMD ["node", "dist/main"]