import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';

import { universalId as generateUniversalId } from '@affine/nbstore';
import type * as ServerNative from '@affine/server-native';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';
import {
  applyUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  mergeUpdates,
} from 'yjs';

import { logger } from './logger';
import { emitExternalDocUpdate, getDocStoragePool } from './nbstore';
import { listLocalWorkspaceIds } from './workspace';
import { getAppDataPath, getSpaceDBPath } from './workspace/meta';

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
  workspaceId: string;
  docId: string;
  title: string;
  createdAt: unknown;
  updatedAt: unknown;
  trash: boolean;
};

const DEFAULT_PORT = 30115;
const serverVersion = '1.0.0';
const configFileName = 'mcp-server.json';

type McpServerConfig = {
  enabled?: boolean;
};

let serverNativePromise: Promise<typeof ServerNative> | null = null;

const loadServerNative = () => {
  serverNativePromise ??= import('@affine/server-native');
  return serverNativePromise;
};

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

const getConfigPath = async () =>
  path.join(await getAppDataPath(), configFileName);

const readConfig = async (): Promise<McpServerConfig> => {
  try {
    return await fs.readJson(await getConfigPath());
  } catch {
    return {};
  }
};

const writeConfig = async (config: McpServerConfig) => {
  await fs.ensureDir(await getAppDataPath());
  await fs.writeJson(await getConfigPath(), config, { spaces: 2 });
};

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

const getWorkspaceIds = async (args: Record<string, unknown>) => {
  const workspaceId =
    parseStringArg(args, 'workspaceId', false) ??
    process.env.AFFINE_MCP_WORKSPACE_ID;
  if (workspaceId) {
    return [workspaceId];
  }

  const workspaceIds = await listLocalWorkspaceIds();
  if (!workspaceIds.length) {
    throw new Error('No local workspace found.');
  }
  return workspaceIds;
};

const getWritableWorkspaceId = async (args: Record<string, unknown>) => {
  const workspaceId =
    parseStringArg(args, 'workspaceId', false) ??
    process.env.AFFINE_MCP_WORKSPACE_ID;
  if (workspaceId) {
    return workspaceId;
  }

  const workspaceIds = await listLocalWorkspaceIds();
  if (!workspaceIds.length) {
    throw new Error('No local workspace found.');
  }
  if (workspaceIds.length > 1) {
    throw new Error(
      'workspaceId is required when multiple local workspaces exist.'
    );
  }
  return workspaceIds[0];
};

const getWorkspaceIdForDoc = async (
  args: Record<string, unknown>,
  docId: string
) => {
  const workspaceId =
    parseStringArg(args, 'workspaceId', false) ??
    process.env.AFFINE_MCP_WORKSPACE_ID;
  if (workspaceId) {
    return workspaceId;
  }

  const matches = [];
  for (const candidateWorkspaceId of await getWorkspaceIds(args)) {
    if (await getMergedDocUpdate(candidateWorkspaceId, docId)) {
      matches.push(candidateWorkspaceId);
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(
      `Doc ${docId} exists in multiple workspaces. Provide workspaceId.`
    );
  }
  throw new Error(`Doc with id ${docId} not found.`);
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

/** Push update and notify renderer about the change */
const pushUpdateAndNotify = async (
  pool: ReturnType<typeof getDocStoragePool>,
  universalId: string,
  docId: string,
  update: Uint8Array
) => {
  await pool.pushUpdate(universalId, docId, update);
  emitExternalDocUpdate(universalId, docId, update);
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
      workspaceId,
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
  await pushUpdateAndNotify(pool, universalId, workspaceId, update);
};

const buildTools = (): ToolDefinition[] => [
  {
    name: 'list_workspaces',
    title: 'List Workspaces',
    description:
      'List all local AFFiNE workspace IDs available to this desktop app.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async () => text(await listLocalWorkspaceIds()),
  },
  {
    name: 'get_workspace_info',
    title: 'Get Workspace Info',
    description:
      'Get workspace metadata including name, document count, and avatar key.',
    inputSchema: {
      type: 'object',
      properties: { workspaceId: { type: 'string' } },
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWritableWorkspaceId(args);
      const rootBin = await getMergedDocUpdate(workspaceId, workspaceId);
      if (!rootBin) return error(`Workspace ${workspaceId} not found.`);
      const { parseWorkspaceDoc } = await loadServerNative();
      const info = parseWorkspaceDoc(rootBin);
      const docs = await listDocumentMetas(workspaceId);
      return text({
        workspaceId,
        name: info?.name ?? 'Untitled',
        avatarKey: info?.avatarKey ?? null,
        docCount: docs.length,
      });
    },
  },
  {
    name: 'list_documents',
    title: 'List Documents',
    description:
      'List documents in local workspaces. If workspaceId is omitted, documents from all local workspaces are returned.',
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
      const workspaceIds = await getWorkspaceIds(args);
      const limit = Math.max(
        1,
        Math.min(parseNumberArg(args, 'limit', 50), 100)
      );
      const offset = Math.max(0, parseNumberArg(args, 'offset', 0));
      const docs = (
        await Promise.all(
          workspaceIds.map(workspaceId => listDocumentMetas(workspaceId))
        )
      ).flat();
      return text(docs.slice(offset, offset + limit));
    },
  },
  {
    name: 'read_document',
    title: 'Read Document',
    description:
      'Read a document as Markdown. If workspaceId is omitted, all local workspaces are searched by docId.',
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
      const docId = parseStringArg(args, 'docId');
      const workspaceId = await getWorkspaceIdForDoc(args, docId);
      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) {
        return error(`Doc with id ${docId} not found.`);
      }
      const { parseDocToMarkdown } = await loadServerNative();
      const result = parseDocToMarkdown(docBin, docId, false);
      return text(result.markdown);
    },
  },
  {
    name: 'keyword_search',
    title: 'Keyword Search',
    description:
      'Search local documents by keyword. If workspaceId is omitted, all local workspaces are searched.',
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
      const workspaceIds = await getWorkspaceIds(args);
      const query = parseStringArg(args, 'query').trim().toLocaleLowerCase();
      const limit = Math.max(
        1,
        Math.min(parseNumberArg(args, 'limit', 20), 100)
      );
      if (!query) {
        return error('query is required.');
      }

      const matches = [];
      for (const workspaceId of workspaceIds) {
        for (const doc of await listDocumentMetas(workspaceId)) {
          const docBin = await getMergedDocUpdate(workspaceId, doc.docId);
          if (!docBin) {
            continue;
          }
          const { parseDocToMarkdown } = await loadServerNative();
          const markdown = parseDocToMarkdown(
            docBin,
            doc.docId,
            false
          ).markdown;
          if (
            doc.title.toLocaleLowerCase().includes(query) ||
            markdown.toLocaleLowerCase().includes(query)
          ) {
            matches.push({
              workspaceId,
              docId: doc.docId,
              title: doc.title,
              preview: markdown.slice(0, 500),
            });
          }
          if (matches.length >= limit) {
            break;
          }
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
      const workspaceId = await getWritableWorkspaceId(args);
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
      const { addDocToRootDoc, createDocWithMarkdown } =
        await loadServerNative();

      const docId = nanoid();
      await pushUpdateAndNotify(
        pool,
        universalId,
        workspaceId,
        addDocToRootDoc(rootBin, docId, title)
      );
      await pushUpdateAndNotify(
        pool,
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
      const docId = parseStringArg(args, 'docId');
      const workspaceId = await getWorkspaceIdForDoc(args, docId);
      const content = parseStringArg(args, 'content');
      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) {
        return error(`Doc with id ${docId} not found.`);
      }

      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      const { updateDocWithMarkdown } = await loadServerNative();
      await pushUpdateAndNotify(
        pool,
        universalId,
        docId,
        updateDocWithMarkdown(docBin, content, docId)
      );

      return text({ success: true, workspaceId, docId });
    },
  },
  {
    name: 'append_to_document',
    title: 'Append to Document',
    description:
      'Append Markdown content to the end of an existing document without replacing existing content.',
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
      const docId = parseStringArg(args, 'docId');
      const workspaceId = await getWorkspaceIdForDoc(args, docId);
      const appendContent = parseStringArg(args, 'content');
      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) return error(`Doc with id ${docId} not found.`);

      const { parseDocToMarkdown, updateDocWithMarkdown } =
        await loadServerNative();
      const existing = parseDocToMarkdown(docBin, docId, false);
      const merged = existing.markdown.trimEnd() + '\n\n' + appendContent;

      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      await pushUpdateAndNotify(
        pool,
        universalId,
        docId,
        updateDocWithMarkdown(docBin, merged, docId)
      );

      return text({ success: true, workspaceId, docId });
    },
  },
  {
    name: 'get_document_outline',
    title: 'Get Document Outline',
    description:
      'Return the heading structure (outline) of a document as a list of headings with levels.',
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
      const docId = parseStringArg(args, 'docId');
      const workspaceId = await getWorkspaceIdForDoc(args, docId);
      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) return error(`Doc with id ${docId} not found.`);

      const { parseDocToMarkdown } = await loadServerNative();
      const { markdown, title } = parseDocToMarkdown(docBin, docId, false);
      const headings: { level: number; text: string }[] = [];
      for (const line of markdown.split('\n')) {
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (match) {
          headings.push({ level: match[1].length, text: match[2].trim() });
        }
      }
      return text({ title, headings });
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
      const docId = parseStringArg(args, 'docId');
      const workspaceId = await getWorkspaceIdForDoc(args, docId);
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
      const { updateRootDocMetaTitle, updateDocTitle } =
        await loadServerNative();
      await pushUpdateAndNotify(
        pool,
        universalId,
        workspaceId,
        updateRootDocMetaTitle(rootBin, docId, title)
      );
      await pushUpdateAndNotify(
        pool,
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
      const docId = parseStringArg(args, 'docId');
      const workspaceId = await getWorkspaceIdForDoc(args, docId);
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
  // ─── Journal Tools ─────────────────────────────────────────────────
  {
    name: 'get_journal',
    title: 'Get Journal',
    description:
      'Get today\'s journal (or a specific date). Creates it if it does not exist. Date format: YYYY-MM-DD.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
      },
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWritableWorkspaceId(args);
      const date =
        parseStringArg(args, 'date', false) ||
        new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return error('Invalid date format. Use YYYY-MM-DD.');
      }

      const docs = await listDocumentMetas(workspaceId);
      const existing = docs.find(d => d.title === date);
      if (existing) {
        const docBin = await getMergedDocUpdate(workspaceId, existing.docId);
        if (docBin) {
          const { parseDocToMarkdown } = await loadServerNative();
          const result = parseDocToMarkdown(docBin, existing.docId, false);
          return text({
            workspaceId,
            docId: existing.docId,
            date,
            markdown: result.markdown,
          });
        }
      }

      // Create new journal
      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      const rootBin = await getMergedDocUpdate(workspaceId, workspaceId);
      if (!rootBin) return error(`Workspace ${workspaceId} not found.`);
      const { addDocToRootDoc, createDocWithMarkdown } =
        await loadServerNative();
      const docId = nanoid();
      await pushUpdateAndNotify(pool, universalId, workspaceId, addDocToRootDoc(rootBin, docId, date));
      await pushUpdateAndNotify(pool, universalId, docId, createDocWithMarkdown(date, '', docId));
      return text({ workspaceId, docId, date, markdown: '', created: true });
    },
  },
  {
    name: 'update_journal',
    title: 'Update Journal',
    description:
      'Replace the content of today\'s journal (or a specific date) with new Markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        content: { type: 'string' },
      },
      required: ['content'],
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWritableWorkspaceId(args);
      const date =
        parseStringArg(args, 'date', false) ||
        new Date().toISOString().slice(0, 10);
      const content = parseStringArg(args, 'content');

      const docs = await listDocumentMetas(workspaceId);
      let docId = docs.find(d => d.title === date)?.docId;

      if (!docId) {
        // Create journal first
        const { pool, universalId } =
          await ensureWorkspaceConnected(workspaceId);
        const rootBin = await getMergedDocUpdate(workspaceId, workspaceId);
        if (!rootBin) return error(`Workspace ${workspaceId} not found.`);
        const { addDocToRootDoc, createDocWithMarkdown } =
          await loadServerNative();
        docId = nanoid();
        await pushUpdateAndNotify(pool, universalId, workspaceId, addDocToRootDoc(rootBin, docId, date));
        await pushUpdateAndNotify(pool, universalId, docId, createDocWithMarkdown(date, content, docId));
        return text({ success: true, workspaceId, docId, date, created: true });
      }

      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) return error(`Journal doc not found.`);
      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      const { updateDocWithMarkdown } = await loadServerNative();
      await pushUpdateAndNotify(pool, universalId, docId, updateDocWithMarkdown(docBin, content, docId));
      return text({ success: true, workspaceId, docId, date });
    },
  },
  {
    name: 'append_to_journal',
    title: 'Append to Journal',
    description:
      'Append Markdown content to today\'s journal (or a specific date) without replacing existing content.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        content: { type: 'string' },
      },
      required: ['content'],
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWritableWorkspaceId(args);
      const date =
        parseStringArg(args, 'date', false) ||
        new Date().toISOString().slice(0, 10);
      const appendContent = parseStringArg(args, 'content');

      const docs = await listDocumentMetas(workspaceId);
      let docId = docs.find(d => d.title === date)?.docId;

      if (!docId) {
        const { pool, universalId } =
          await ensureWorkspaceConnected(workspaceId);
        const rootBin = await getMergedDocUpdate(workspaceId, workspaceId);
        if (!rootBin) return error(`Workspace ${workspaceId} not found.`);
        const { addDocToRootDoc, createDocWithMarkdown } =
          await loadServerNative();
        docId = nanoid();
        await pushUpdateAndNotify(pool, universalId, workspaceId, addDocToRootDoc(rootBin, docId, date));
        await pushUpdateAndNotify(pool, universalId, docId, createDocWithMarkdown(date, appendContent, docId));
        return text({ success: true, workspaceId, docId, date, created: true });
      }

      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) return error(`Journal doc not found.`);
      const { parseDocToMarkdown, updateDocWithMarkdown } =
        await loadServerNative();
      const existing = parseDocToMarkdown(docBin, docId, false);
      const merged = existing.markdown.trimEnd() + '\n\n' + appendContent;
      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      await pushUpdateAndNotify(pool, universalId, docId, updateDocWithMarkdown(docBin, merged, docId));
      return text({ success: true, workspaceId, docId, date });
    },
  },
  {
    name: 'clear_journal',
    title: 'Clear Journal',
    description: 'Clear the content of a journal for a specific date.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
      },
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceId = await getWritableWorkspaceId(args);
      const date =
        parseStringArg(args, 'date', false) ||
        new Date().toISOString().slice(0, 10);

      const docs = await listDocumentMetas(workspaceId);
      const docId = docs.find(d => d.title === date)?.docId;
      if (!docId) return error(`No journal found for ${date}.`);

      const docBin = await getMergedDocUpdate(workspaceId, docId);
      if (!docBin) return error(`Journal doc not found.`);
      const { pool, universalId } = await ensureWorkspaceConnected(workspaceId);
      const { updateDocWithMarkdown } = await loadServerNative();
      await pushUpdateAndNotify(pool, universalId, docId, updateDocWithMarkdown(docBin, '', docId));
      return text({ success: true, workspaceId, docId, date });
    },
  },
  {
    name: 'list_today_documents',
    title: 'List Today\'s Documents',
    description:
      'List all documents created or updated today. Useful for summarizing daily work into the journal.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
      },
      additionalProperties: false,
    },
    execute: async args => {
      const workspaceIds = await getWorkspaceIds(args);
      const date =
        parseStringArg(args, 'date', false) ||
        new Date().toISOString().slice(0, 10);
      const dayStart = new Date(date + 'T00:00:00').getTime();
      const dayEnd = dayStart + 86400000;

      const results: {
        workspaceId: string;
        docId: string;
        title: string;
        createdAt: unknown;
        updatedAt: unknown;
      }[] = [];

      for (const workspaceId of workspaceIds) {
        const docs = await listDocumentMetas(workspaceId);
        for (const doc of docs) {
          const created =
            typeof doc.createdAt === 'number' ? doc.createdAt : 0;
          const updated =
            typeof doc.updatedAt === 'number' ? doc.updatedAt : 0;
          if (
            (created >= dayStart && created < dayEnd) ||
            (updated >= dayStart && updated < dayEnd)
          ) {
            results.push({
              workspaceId,
              docId: doc.docId,
              title: doc.title,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
            });
          }
        }
      }
      return text(results);
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

const corsHeaders = (req: IncomingMessage) => {
  const origin = req.headers.origin ?? '*';
  const allowed =
    origin === '*' ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'content-type': 'application/json',
    'access-control-allow-origin': allowed ? origin : 'http://localhost',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
};

const writeJson = (
  res: ServerResponse,
  status: number,
  data: unknown,
  req?: IncomingMessage
) => {
  res.writeHead(
    status,
    req ? corsHeaders(req) : { 'content-type': 'application/json' }
  );
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

let mcpServer: Server | null = null;

export function startMcpServer() {
  if (mcpServer) {
    return;
  }

  const port = Number(process.env.AFFINE_MCP_PORT || DEFAULT_PORT);
  const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    // SSE transport endpoint
    if (req.method === 'GET' && req.url === '/sse') {
      const headers = {
        ...corsHeaders(req),
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      };
      res.writeHead(200, headers);
      res.write(
        `data: ${JSON.stringify({ type: 'endpoint', url: '/mcp' })}\n\n`
      );

      const keepAlive = setInterval(() => {
        res.write(': ping\n\n');
      }, 15000);

      req.on('close', () => clearInterval(keepAlive));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/mcp') {
      writeJson(res, 404, { error: 'Not found' }, req);
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
        res.writeHead(202, corsHeaders(req));
        res.end();
        return;
      }
      writeJson(res, 200, isBatch ? responses : responses[0], req);
    } catch (err) {
      logger.error('[mcp] request failed', err);
      writeJson(res, 500, failure(null, -32603, 'Internal error'), req);
    }
  };

  const server = createServer((req, res) => {
    handleRequest(req, res).catch(err => {
      logger.error('[mcp] unexpected request failure', err);
      writeJson(res, 500, failure(null, -32603, 'Internal error'), req);
    });
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info(`[mcp] listening on http://127.0.0.1:${port}/mcp`);
  });
  mcpServer = server;

  server.on('error', err => {
    mcpServer = null;
    logger.error('[mcp] server error', err);
  });
}

export const stopMcpServer = async () => {
  const server = mcpServer;
  if (!server) {
    return;
  }

  mcpServer = null;
  await new Promise<void>((resolve, reject) => {
    server.close(err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
  logger.info('[mcp] stopped');
};

export const getMcpServerEnabled = async () => {
  return Boolean((await readConfig()).enabled);
};

export const setMcpServerEnabled = async (enabled: boolean) => {
  await writeConfig({ enabled });
  if (enabled) {
    startMcpServer();
  } else {
    await stopMcpServer();
  }
  return getMcpServerStatus();
};

export const getMcpServerStatus = async () => {
  const enabled = await getMcpServerEnabled();
  return {
    enabled,
    running: Boolean(mcpServer),
    url: `http://127.0.0.1:${Number(
      process.env.AFFINE_MCP_PORT || DEFAULT_PORT
    )}/mcp`,
  };
};

export const startMcpServerFromPreference = async () => {
  if (await getMcpServerEnabled()) {
    startMcpServer();
  }
};

process.once('exit', () => {
  mcpServer?.close();
});
