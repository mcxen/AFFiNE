#!/bin/bash
# AFFiNE 本地编译 Docker 镜像脚本
# 用法: ./build-local.sh [--no-cache]
#
# 前置条件:
#   1. 已安装 Node.js (< 23.0.0) 和 yarn
#   2. 已在项目根目录执行过 yarn install
#   3. 已编译前端和后端: yarn build
#
# 如果还没编译，脚本会自动执行编译步骤

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_ARGS=""

if [ "$1" = "--no-cache" ]; then
  DOCKER_ARGS="--no-cache"
fi

echo "=== AFFiNE 本地编译 Docker 镜像 ==="
echo "项目根目录: $PROJECT_ROOT"
echo ""

# 检查是否已编译
check_build() {
  local server_dist="$PROJECT_ROOT/packages/backend/server/dist"
  local web_dist="$PROJECT_ROOT/packages/frontend/apps/web/dist"

  if [ ! -d "$server_dist" ] || [ ! -d "$web_dist" ]; then
    return 1
  fi
  return 0
}

# 编译项目
build_project() {
  echo ">>> 编译项目..."
  cd "$PROJECT_ROOT"

  # 确保依赖已安装
  if [ ! -d "node_modules" ]; then
    echo ">>> 安装依赖..."
    yarn install
  fi

  # 编译前端
  echo ">>> 编译前端 (web + admin)..."
  yarn build @affine/web @affine/admin

  # 编译后端
  echo ">>> 编译后端 (server)..."
  yarn build @affine/server

  echo ">>> 编译完成"
}

# 检查并编译
if ! check_build; then
  echo ">>> 未检测到编译产物，开始编译..."
  build_project
else
  echo ">>> 检测到已有编译产物，跳过编译 (如需重新编译请先 yarn build)"
fi

# 构建 Docker 镜像
echo ""
echo ">>> 构建 Docker 镜像: affine-local:latest"
cd "$PROJECT_ROOT"

docker build \
  -f .docker/selfhost/Dockerfile.local \
  -t affine-local:latest \
  $DOCKER_ARGS \
  .

echo ""
echo "=== 构建完成 ==="
echo ""
echo "启动服务:"
echo "  cd $SCRIPT_DIR"
echo "  cp .env.example .env  # 首次需要配置"
echo "  cp config.example.json ~/.affine/self-host/config/config.json"
echo "  docker compose up -d"
echo ""
echo "查看日志:"
echo "  docker compose logs -f affine"
