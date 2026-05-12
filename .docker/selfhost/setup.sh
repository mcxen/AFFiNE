#!/bin/bash
# AFFiNE 自部署快速配置脚本
# 用法: ./setup.sh
#
# 功能:
#   1. 创建必要的目录
#   2. 生成 .env 文件（如果不存在）
#   3. 生成 config.json（如果不存在）
#   4. 提示用户配置 API Key

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="${HOME}/.affine/self-host/config"
STORAGE_DIR="${HOME}/.affine/self-host/storage"
PGDATA_DIR="${HOME}/.affine/self-host/postgres/pgdata"

echo "=== AFFiNE 自部署配置 ==="
echo ""

# 创建目录
echo ">>> 创建数据目录..."
mkdir -p "$CONFIG_DIR"
mkdir -p "$STORAGE_DIR"
mkdir -p "$PGDATA_DIR"

# 复制 .env
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo ">>> 创建 .env 文件..."
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
else
  echo ">>> .env 已存在，跳过"
fi

# 复制 config.json
CONFIG_FILE="$CONFIG_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo ">>> 创建 config.json..."
  cp "$SCRIPT_DIR/config.example.json" "$CONFIG_FILE"
  echo ""
  echo "=========================================="
  echo "  请编辑 AI 配置文件:"
  echo "  $CONFIG_FILE"
  echo ""
  echo "  将 YOUR_API_KEY 替换为你的 API Key"
  echo "  将 baseURL 修改为你的 API 地址"
  echo ""
  echo "  支持任何 OpenAI 兼容接口:"
  echo "  - OpenAI: https://api.openai.com/v1"
  echo "  - OpenRouter: https://openrouter.ai/api/v1"
  echo "  - 本地 Ollama: http://host.docker.internal:11434/v1"
  echo "  - 自定义: https://your-api.com/v1"
  echo "=========================================="
  echo ""
else
  echo ">>> config.json 已存在，跳过"
fi

echo ""
echo "=== 配置完成 ==="
echo ""
echo "下一步:"
echo "  1. 编辑 $CONFIG_FILE 填入 API Key"
echo "  2. 构建镜像: ./build-local.sh"
echo "  3. 启动服务: docker compose up -d"
echo "  4. 访问: http://localhost:3010"
echo ""
echo "查看日志: docker compose logs -f affine"
echo "停止服务: docker compose down"
