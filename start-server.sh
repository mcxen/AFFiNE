#!/bin/bash

# AFFiNE Server Local Development Startup Script
# This script starts the required services (PostgreSQL, Redis) using Docker
# and then starts the AFFiNE server in development mode

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SERVER_DIR="$PROJECT_ROOT/packages/backend/server"

echo "=================================="
echo "AFFiNE Server Development Launcher"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Start PostgreSQL and Redis
echo ""
echo "Starting PostgreSQL and Redis..."
docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" up -d

# Wait for services to be healthy
echo ""
echo "Waiting for services to be healthy..."
sleep 5

# Check PostgreSQL
echo -n "Checking PostgreSQL..."
for i in {1..30}; do
    if docker exec affine_dev_postgres pg_isready -U affine > /dev/null 2>&1; then
        echo " ✓"
        break
    fi
    if [ $i -eq 30 ]; then
        echo ""
        echo "Error: PostgreSQL failed to start"
        exit 1
    fi
    echo -n "."
    sleep 1
done

# Check Redis
echo -n "Checking Redis..."
for i in {1..30}; do
    if docker exec affine_dev_redis redis-cli --raw incr ping > /dev/null 2>&1; then
        echo " ✓"
        break
    fi
    if [ $i -eq 30 ]; then
        echo ""
        echo "Error: Redis failed to start"
        exit 1
    fi
    echo -n "."
    sleep 1
done

echo ""
echo "Services are ready!"
echo ""

# Setup environment
cd "$SERVER_DIR"

# Check if .env file exists, if not create it
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.development .env
fi

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "node_modules/.cache" ]; then
    echo ""
    echo "Installing dependencies..."
    cd "$PROJECT_ROOT"
    yarn install
    cd "$SERVER_DIR"
fi

# Run database migrations
echo ""
echo "Running database migrations..."
yarn prisma migrate dev

# Run data migrations
echo ""
echo "Running data migrations..."
yarn data-migration run

echo ""
echo "=================================="
echo "Starting AFFiNE Server..."
echo "=================================="
echo ""
echo "Server will be available at: http://localhost:3010"
echo "GraphQL API: http://localhost:3010/graphql"
echo "API Docs: http://localhost:3010/api/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server in development mode
yarn dev
