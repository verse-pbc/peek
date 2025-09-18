# Build stage
FROM rust:latest as builder

WORKDIR /app

# Copy manifest
COPY Cargo.toml ./

# Copy source before generating the lockfile so Cargo sees targets
COPY src ./src

# Generate lockfile (if missing) and build for release
RUN cargo generate-lockfile && cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install necessary runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/target/release/validation-service /app/validation-service

# Expose port
EXPOSE 3001

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Run the binary
CMD ["./validation-service"]