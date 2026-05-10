#!/bin/bash

# AFFiNE Server Local Development Stop Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

echo "Stopping AFFiNE Server development services..."
docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" down

echo "Services stopped."
