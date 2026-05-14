#!/bin/bash
# Download minimal draw.io static resources for offline use.
# Run this script to enable fully offline draw.io editing.
#
# Usage: bash scripts/setup-drawio-offline.sh

set -e

DRAWIO_VERSION="v26.0.9"
TARGET_DIR="packages/frontend/apps/web/dist/static/drawio"

echo "Downloading draw.io ${DRAWIO_VERSION} for offline use..."

# Clone only the webapp directory (sparse checkout)
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
git init
git remote add origin https://github.com/jgraph/drawio.git
git config core.sparseCheckout true
echo "src/main/webapp/" > .git/info/sparse-checkout
git pull --depth=1 origin ${DRAWIO_VERSION}

# Copy essential files
cd -
rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"
cp -r "${TEMP_DIR}/src/main/webapp/"* "${TARGET_DIR}/"

# Remove unnecessary files to reduce size
rm -rf "${TARGET_DIR}/stencils" 2>/dev/null || true
rm -rf "${TARGET_DIR}/templates" 2>/dev/null || true
rm -rf "${TARGET_DIR}/resources/"!(dia|dia_zh).txt 2>/dev/null || true

# Cleanup
rm -rf "$TEMP_DIR"

echo "Done! Draw.io offline resources installed to ${TARGET_DIR}"
echo "Size: $(du -sh ${TARGET_DIR} | cut -f1)"
