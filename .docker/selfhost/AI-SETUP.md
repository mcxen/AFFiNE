# AFFiNE AI 自部署配置指南

## 快速开始

### 1. 配置 AI Provider

编辑 `~/.affine/self-host/config/config.json`（首次使用请从 `config.example.json` 复制）：

```json
{
  "server": {
    "name": "AFFiNE Self Hosted Server"
  },
  "copilot": {
    "enabled": true,
    "byok.enabled": true,
    "byok.allowedProviders": ["openai", "anthropic", "gemini", "fal"],
    "byok.allowCustomEndpoint": true,
    "providers.profiles": [
      {
        "id": "openai-compat",
        "type": "openai",
        "displayName": "My AI Provider",
        "enabled": true,
        "priority": 100,
        "config": {
          "apiKey": "sk-xxxxxxxx",
          "baseURL": "https://api.openai.com/v1"
        }
      }
    ],
    "providers.defaults": {
      "text": "openai-compat",
      "object": "openai-compat",
      "embedding": "openai-compat",
      "structured": "openai-compat",
      "fallback": "openai-compat"
    }
  }
}
```

**关键**: `baseURL` 支持任何 OpenAI 兼容接口（OpenRouter、OneAPI、NewAPI、vLLM、Ollama 等）。

### 2. 启动服务

```bash
cd .docker/selfhost
cp .env.example .env
# 编辑 .env 设置密码等
mkdir -p ~/.affine/self-host/config
cp config.example.json ~/.affine/self-host/config/config.json
# 编辑 config.json 填入你的 API Key

docker compose up -d
```

### 3. 验证 AI 功能

访问 `http://localhost:3010`，打开任意文档，点击右侧 AI 聊天面板：
- 基础对话：直接输入问题
- 文档对话：点击输入框左侧 "+" 按钮添加文档作为上下文

---

## 文档对话功能（Document Context）

### 工作原理

文档对话依赖 **Embedding（向量嵌入）** 功能：
1. 用户选择文档 → 服务端将文档内容切片并生成 embedding 向量
2. 用户提问 → 服务端将问题生成 embedding，在向量数据库中匹配相关内容
3. 匹配到的内容作为上下文发送给 LLM

### 必要条件

1. **PostgreSQL 必须安装 pgvector 扩展**
   - compose.yml 已使用 `pgvector/pgvector:pg16` 镜像（自带 pgvector）✓
   - 迁移脚本会自动创建 embedding 表 ✓

2. **必须配置支持 embedding 的 provider**
   - `providers.defaults.embedding` 必须指向一个有效的 provider
   - 该 provider 的 API 必须支持 `/embeddings` 接口
   - 推荐模型：`text-embedding-3-small`（OpenAI）或兼容接口

3. **迁移必须成功运行**
   - `docker compose up` 时 `affine_migration` 容器会自动执行
   - 检查：`docker logs affine_migration_job`

### 排查文档对话不显示

如果点击 "+" 后能看到文档列表，但添加后状态一直是 "processing" 或 "failed"：

```bash
# 1. 检查迁移是否成功
docker logs affine_migration_job

# 2. 检查 embedding 表是否存在
docker exec -it affine_postgres psql -U affine -d affine -c "
  SELECT tablename FROM pg_tables
  WHERE tablename IN ('ai_context_embeddings', 'ai_workspace_embeddings');
"

# 3. 如果表不存在，手动修复
docker exec -i affine_postgres psql -U affine -d affine < \
  ../../packages/backend/server/scripts/repair-pgvector-embedding-tables.sql

# 4. 检查服务端日志中的 embedding 错误
docker logs affine_server 2>&1 | grep -i "embedding"

# 5. 重启服务
docker compose restart affine
```

### 常见问题

**Q: "Copilot embedding client is not configured properly" 警告**
A: `providers.defaults.embedding` 未配置或指向的 provider 不支持 embedding。确保你的 API 支持 `/v1/embeddings` 接口。

**Q: 文档添加后一直显示 "processing"**
A: embedding 生成需要时间，如果长时间不变，检查服务端日志。可能是 API 调用失败。

**Q: 使用自定义 API 但 embedding 不工作**
A: 确认你的 API 兼容 OpenAI 的 `/v1/embeddings` 接口格式。部分中转服务可能不支持 embedding。

---

## BYOK（Bring Your Own Key）

BYOK 允许工作区成员使用自己的 API Key，无需管理员统一配置。

### 服务端配置

在 `config.json` 中启用：
```json
{
  "copilot": {
    "byok.enabled": true,
    "byok.allowedProviders": ["openai", "anthropic", "gemini", "fal"],
    "byok.allowCustomEndpoint": true
  }
}
```

### 用户使用

1. 进入工作区 Settings → AI
2. 在 BYOK 区域添加自己的 API Key
3. 支持两种存储模式：
   - **Server**: Key 加密存储在服务端，所有设备可用
   - **Local**: Key 仅存储在本地客户端（桌面版），10分钟 lease

### 支持的 Provider

| Provider | 能力 |
|----------|------|
| OpenAI | 文本、图片输入、Actions、图片生成 |
| Anthropic | 文本、图片输入 |
| Gemini | 文本、图片输入、Actions、图片生成、转录、索引 |
| FAL | 图片生成 |

所有 provider 都支持自定义 endpoint（OpenAI 兼容格式）。

---

## 多 Provider 配置示例

```json
{
  "copilot": {
    "enabled": true,
    "byok.enabled": true,
    "byok.allowCustomEndpoint": true,
    "providers.profiles": [
      {
        "id": "main-api",
        "type": "openai",
        "displayName": "主力 API (聊天/生成)",
        "enabled": true,
        "priority": 100,
        "config": {
          "apiKey": "sk-xxx",
          "baseURL": "https://your-api.com/v1"
        }
      },
      {
        "id": "embedding-api",
        "type": "openai",
        "displayName": "Embedding 专用",
        "enabled": true,
        "priority": 50,
        "models": ["text-embedding-3-small", "text-embedding-3-large"],
        "config": {
          "apiKey": "sk-yyy",
          "baseURL": "https://api.openai.com/v1"
        }
      }
    ],
    "providers.defaults": {
      "text": "main-api",
      "object": "main-api",
      "embedding": "embedding-api",
      "structured": "main-api",
      "fallback": "main-api"
    }
  }
}
```

这样可以用便宜的 API 做聊天，用 OpenAI 官方做 embedding（质量更好）。

---

## 本地编译

### 使用 build-local.sh（推荐）

```bash
cd .docker/selfhost
./build-local.sh
```

脚本会自动检测是否已编译，未编译则自动执行 `yarn build`。

### 手动编译

```bash
# 1. 安装依赖
yarn install

# 2. 编译前端
yarn build @affine/web @affine/admin

# 3. 编译后端
yarn build @affine/server

# 4. 构建 Docker 镜像
docker build -f .docker/selfhost/Dockerfile.local -t affine-local:latest .

# 5. 启动
cd .docker/selfhost
docker compose up -d
```

### 开发模式（不用 Docker）

```bash
# 启动 PostgreSQL 和 Redis（可以用 Docker）
docker compose up -d postgres redis

# 设置环境变量
export DATABASE_URL="postgresql://affine:affine@localhost:5432/affine"
export REDIS_SERVER_HOST=localhost

# 运行迁移
cd packages/backend/server
yarn prisma migrate deploy
node scripts/self-host-predeploy.js

# 启动开发服务器
yarn dev
```

---

## 注意事项

- 修改 `config.json` 后必须 `docker compose restart affine` 才能生效
- 首次启动需要等待迁移完成（约 30 秒）
- embedding 功能需要 pgvector 扩展，compose.yml 中的 postgres 镜像已包含
- 如果 API 不支持 embedding，文档对话功能将不可用，但基础 AI 聊天仍然正常
