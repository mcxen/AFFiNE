import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import {
  addDocToRootDoc,
  createDocWithMarkdown,
  parseDocToMarkdown,
  updateDocTitle,
  updateDocWithMarkdown,
  updateRootDocMetaTitle,
} from '@affine/server-native';
import { universalId as generateUniversalId } from '@affine/nbstore';
import { nanoid } from 'nanoid';
import {
  applyUpdate,
  encodeStateAsUpdate,
  mergeUpdates,
  Doc as YDoc,
} from 'yjs';

import { logger } from './logger';
import { getDocStoragePool } from './nbstore';
import { listLocalWorkspaceIds } from './workspace';
import { getSpaceDBPath } from './workspace/meta';

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
};

type DocumentMeta = {
  docId: string;
  title: string;
  createdAt: unknown;
  updatedAt: unknown;
  trash: boolean;
};

const DEFAULT_PORT = 30115;
const serverVersion = '1.0.0';

const text = (value: unknown): ToolResult => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value),
    },
  ],
});

const error = (message: string): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

const sanitizeTitle = (title: string) => title.replace(/[\r\n]+/g, ' ').trim();

const stripLeadingH1 = (content: string) =>
  content.replace(/^[ \t]{0,3}#\s+[^\n]*#*\s*\n*/, '');

function parseStringArg(
  args: Record<string, unknown>,
  key: string,
  required?: true
): string;
function parseStringArg(
  args: Record<string, unknown>,
  key: string,
  required: false
): string | undefined;
function parseStringArg(
  args: Record<string, unknown>,
  key: string,
  required = true
) {
  const value = args[key];
  if (typeof value === 'string') {
    return value;
  }
  if (required) {
    throw new Error(`${key} is required.`);
  }
  return undefined;
}

const parseNumberArg = (
  args: Record<string, unknown>,
  key: string,
  fallback: number
) => {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const getWorkspaceId = async (args: Record<string, unknown>) => {
  const workspaceId =
    parseStringArg(args, 'workspaceId', false) ??
    process.env.AFFINE_MCP_WORKSPACE_ID;
  if (workspaceId) {
    return workspaceId;
  }

  const [firstWorkspaceId] = await listLocalWorkspaceIds();
  if (!firstWorkspaceId) {
    throw new Error('No local workspace found.');
  }
  return firstWorkspaceId;
};

const getLocalUniversalId = (workspaceId: string) =>
  generateUniversalId({
    peer: 'local',
    type: 'workspace',
    id: workspaceId,
  });

const ensureWorkspaceConnected = async (workspaceId: string) => {
  const universalId = getLocalUniversalId(workspaceId);
  const dbPath = await getSpaceDBPath('local', 'workspace', workspaceId);
  const pool = getDocStoragePool();
  await pool.connect(universalId, dbPath);
  await pool.setSpaceId(universalId, workspaceId);
  return { pool, universalId };
};

const getMergedDocUpdate = async (workspaceId: string, docId: string) => {
  const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
  const snapshot = await pool.getDocSnapshot(universalId, docId);
  const updates = await pool.getDocUpdates(universalId, docId);
  const bins = [snapshot?.bin, ...updates.map(update => update.bin)].filter(
    (bin): bin is Uint8Array => !!bin
  );

  if (!bins.length) {
    return null;
  }

  return Buffer.from(bins.length === 1 ? bins[0] : mergeUpdates(bins));
};

const getRootDoc = async (workspaceId: string) => {
  const rootBin = await getMergedDocUpdate(workspaceId, workspaceId);
  if (!rootBin) {
    throw new Error(`Workspace ${workspaceId} not found.`);
  }

  const rootDoc = new YDoc();
  applyUpdate(rootDoc, rootBin);
  return rootDoc;
};

const listDocumentMetas = async (workspaceId: string) => {
  const rootDoc = await getRootDoc(workspaceId);
  const pages = rootDoc.getMap('meta').get('pages') as
    | ArrayLike<unknown>
    | undefined;

  if (!pages || typeof (pages as any).toArray !== 'function') {
    return [];
  }

  return (pages as any)
    .toArray()
    .map((page: any) => ({
      docId: page.get('id'),
      title:
        typeof page.get('title') === 'string' ? page.get('title') : 'Untitled',
      createdAt: page.get('createDate') ?? null,
      updatedAt: page.get('updatedDate') ?? null,
      trash: page.get('trash') ?? false,
    }))
    .filter((page: { docId: unknown; trash: boolean }) => {
      return typeof page.docId === 'string' && !page.trash;
    }) as DocumentMeta[];
};

const pushRootUpdate = async (workspaceId: string, update: Uint8Array) => {
  const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
  await pool.pushUpdate(universalId, workspaceId, update);
};

const buildTools = (): ToolDefinition[] => [
  {
    name: 'list_workspaces',
    title: 'List Workspaces',
    description:
      'List local AFFiNE workspace IDs available to this desktop app.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async () => text(await listLocalWorkspaceIds()),
  },
  {
    name: 'list_documents',
    title: 'List Documents',
    description:
      'List documents in a local workspace. If workspaceId is omitted, the first local workspace is used.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWorkspaceId(args);
      const limit = Math.max(
        1,
        Math.min(parseNumberArg(args, 'limit', 50), 100)
      );
      const offset = Math.max(0, parseNumberArg(args, 'offset', 0));
      const docs = await listDocumentMetas(workspaceId);
      return text(docs.slice(offset, offset + limit));
    },
  },
  {
    name: 'read_document',
    title: 'Read Document',
    description: 'Read a document as Markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        docId: { type: 'string' },
      },
      required: ['docId'],
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWorkspaceId(args);
      const docId = parseStringArg(args, 'docId');
      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) {
        return error(`Doc with id ${docId} not found.`);
      }
      const result = parseDocToMarkdown(docBin, docId, false);
      return text(result.markdown);
    },
  },
  {
    name: 'keyword_search',
    title: 'Keyword Search',
    description: 'Search local documents by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWorkspaceId(args);
      const query = parseStringArg(args, 'query').trim().toLocaleLowerCase();
      const limit = Math.max(
        1,
        Math.min(parseNumberArg(args, 'limit', 20), 100)
      );
      if (!query) {
        return error('query is required.');
      }

      const matches = [];
      for (const doc of await listDocumentMetas(workspaceId)) {
        const docBin = await getMergedDocUpdate(workspaceId, doc.docId);
        if (!docBin) {
          continue;
        }
        const markdown = parseDocToMarkdown(docBin, doc.docId, false).markdown;
        if (
          doc.title.toLocaleLowerCase().includes(query) ||
          markdown.toLocaleLowerCase().includes(query)
        ) {
          matches.push({
            docId: doc.docId,
            title: doc.title,
            preview: markdown.slice(0, 500),
          });
        }
        if (matches.length >= limit) {
          break;
        }
      }
      return text(matches);
    },
  },
  {
    name: 'create_document',
    title: 'Create Document',
    description: 'Create a new document from title and Markdown content.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWorkspaceId(args);
      const title = sanitizeTitle(parseStringArg(args, 'title'));
      const content = stripLeadingH1(parseStringArg(args, 'content'));
      if (!title) {
        return error('title cannot be empty.');
      }

      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      const rootBin = await getMergedDocUpdate(workspaceId, workspaceId);
      if (!rootBin) {
        return error(`Workspace ${workspaceId} not found.`);
      }

      const docId = nanoid();
      await pool.pushUpdate(
        universalId,
        workspaceId,
        addDocToRootDoc(rootBin, docId, title)
      );
      await pool.pushUpdate(
        universalId,
        docId,
        createDocWithMarkdown(title, content, docId)
      );

      return text({ success: true, workspaceId, docId });
    },
  },
  {
    name: 'update_document',
    title: 'Update Document',
    description: 'Replace an existing document body with Markdown content.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        docId: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['docId', 'content'],
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWorkspaceId(args);
      const docId = parseStringArg(args, 'docId');
      const content = parseStringArg(args, 'content');
      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) {
        return error(`Doc with id ${docId} not found.`);
      }

      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      await pool.pushUpdate(
        universalId,
        docId,
        updateDocWithMarkdown(docBin, content, docId)
      );

      return text({ success: true, workspaceId, docId });
    },
  },
  {
    name: 'update_document_meta',
    title: 'Update Document Metadata',
    description: 'Update document metadata. Currently supports title.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        docId: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['docId', 'title'],
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWorkspaceId(args);
      const docId = parseStringArg(args, 'docId');
      const title = sanitizeTitle(parseStringArg(args, 'title'));
      if (!title) {
        return error('title cannot be empty.');
      }

      const rootBin = await getMergedDocUpdate(workspaceId, workspaceId);
      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!rootBin || !docBin) {
        return error(`Doc with id ${docId} not found.`);
      }

      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      await pool.pushUpdate(
        universalId,
        workspaceId,
        updateRootDocMetaTitle(rootBin, docId, title)
      );
      await pool.pushUpdate(
        universalId,
        docId,
        updateDocTitle(docBin, title, docId)
      );

      return text({ success: true, workspaceId, docId });
    },
  },
  {
    name: 'delete_document',
    title: 'Delete Document',
    description: 'Delete a document from a local workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        docId: { type: 'string' },
      },
      required: ['docId'],
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWorkspaceId(args);
      const docId = parseStringArg(args, 'docId');
      if (docId === workspaceId) {
        return error('Cannot delete the workspace root document.');
      }

      const rootDoc = await getRootDoc(workspaceId);
      const pages = rootDoc.getMap('meta').get('pages') as any;
      if (!pages || typeof pages.toArray !== 'function') {
        return error(`Doc with id ${docId} not found.`);
      }

      const index = pages
        .toArray()
        .findIndex((page: any) => page.get('id') === docId);
      if (index === -1) {
        return error(`Doc with id ${docId} not found.`);
      }

      pages.delete(index, 1);
      await pushRootUpdate(workspaceId, encodeStateAsUpdate(rootDoc));

      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      await pool.deleteDoc(universalId, docId);

      return text({ success: true, workspaceId, docId });
    },
  },
];

const tools = buildTools();

const readBody = async (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

const writeJson = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': 'http://127.0.0.1',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(data));
};

const success = (id: JsonRpcId, result: Record<string, unknown>) => ({
  jsonrpc: '2.0',
  id,
  result,
});

const failure = (id: JsonRpcId, code: number, message: string) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});

const handleMessage = async (message: JsonRpcRequest) => {
  const id = message.id ?? null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return failure(id, -32600, 'Invalid Request');
  }

  switch (message.method) {
    case 'initialize':
      return success(id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'AFFiNE Desktop MCP Server',
          version: serverVersion,
        },
      });
    case 'notifications/initialized':
      return null;
    case 'ping':
      return success(id, {});
    case 'tools/list':
      return success(id, {
        tools: tools.map(tool => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
    case 'tools/call': {
      const name = message.params?.name;
      const args = message.params?.arguments;
      if (typeof name !== 'string') {
        return failure(id, -32602, 'Invalid params');
      }
      const tool = tools.find(tool => tool.name === name);
      if (!tool) {
        return failure(id, -32602, `Tool not found: ${name}`);
      }
      try {
        return success(
          id,
          await tool.execute((args ?? {}) as Record<string, unknown>)
        );
      } catch (err) {
        logger.error('[mcp] tool failed', name, err);
        return failure(
          id,
          -32001,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
    default:
      return failure(id, -32601, 'Method not found');
  }
};

let serverStarted = false;

export function startMcpServer() {
  if (serverStarted) {
    return;
  }
  serverStarted = true;

  const port = Number(process.env.AFFINE_MCP_PORT || DEFAULT_PORT);
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      writeJson(res, 204, {});
      return;
    }
    if (req.method !== 'POST' || req.url !== '/mcp') {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }

    try {
      const body = JSON.parse(await readBody(req));
      const isBatch = Array.isArray(body);
      const messages = isBatch ? body : [body];
      const responses = (
        await Promise.all(messages.map(message => handleMessage(message)))
      ).filter(Boolean);

      if (!responses.length) {
        res.writeHead(202);
        res.end();
        return;
      }
      writeJson(res, 200, isBatch ? responses : responses[0]);
    } catch (err) {
      logger.error('[mcp] request failed', err);
      writeJson(res, 500, failure(null, -32603, 'Internal error'));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info(`[mcp] listening on http://127.0.0.1:${port}/mcp`);
  });

  server.on('error', err => {
    serverStarted = false;
    logger.error('[mcp] server error', err);
  });

  process.on('exit', () => {
    server.close();
  });
}
