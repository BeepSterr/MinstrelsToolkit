# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY vite.config.ts tsconfig.json ./

# Build the client
RUN bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy built client from builder stage
COPY --from=builder /app/dist ./dist

# Copy server source
COPY src/server ./src/server

# Create storage directory
RUN mkdir -p /app/storage

# Expose the port
EXPOSE 3000

# Set environment variables
ENV PORT=3000

# Run the server
CMD ["bun", "run", "src/server/index.ts"]
