import path from 'node:path';

import { app, safeStorage } from 'electron';

import { logger } from '../logger';
import { PersistentJSONFileStorage } from '../shared-storage/json-file';
import type { NamespaceHandlers } from '../type';

const byokStorage = new PersistentJSONFileStorage(
  path.join(app.getPath('userData'), 'workspace-byok-keys.json')
);

export function disposeWorkspaceByokStorage() {
  byokStorage.dispose();
}

const allowedProviders = new Set(['openai', 'anthropic', 'gemini', 'fal']);

const useEncryption = safeStorage.isEncryptionAvailable();

type WorkspaceByokKey = {
  id: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'fal';
  name: string;
  description?: string | null;
  apiKey: string;
  endpoint?: string | null;
  sortOrder?: number | null;
  enabled?: boolean | null;
};

type WorkspaceByokKeyInput = Omit<WorkspaceByokKey, 'apiKey'> & {
  apiKey?: string | null;
};

function hasOwnField(
  key: WorkspaceByokKeyInput,
  field: keyof WorkspaceByokKey
) {
  return Object.prototype.hasOwnProperty.call(key, field);
}

function normalizeKey(
  key: WorkspaceByokKeyInput,
  existing?: WorkspaceByokKey,
  defaultSortOrder = 0
): WorkspaceByokKey {
  if (!allowedProviders.has(key.provider)) {
    throw new Error('Unsupported BYOK provider.');
  }
  const apiKey = key.apiKey ?? existing?.apiKey;
  if (!key.id || !key.name || !apiKey) {
    throw new Error('Invalid BYOK key.');
  }
  return {
    id: key.id,
    provider: key.provider,
    name: key.name,
    description: hasOwnField(key, 'description')
      ? (key.description ?? null)
      : (existing?.description ?? null),
    apiKey,
    endpoint: hasOwnField(key, 'endpoint')
      ? (key.endpoint ?? null)
      : (existing?.endpoint ?? null),
    sortOrder: hasOwnField(key, 'sortOrder')
      ? (key.sortOrder ?? defaultSortOrder)
      : (existing?.sortOrder ?? defaultSortOrder),
    enabled: hasOwnField(key, 'enabled')
      ? (key.enabled ?? true)
      : (existing?.enabled ?? true),
  };
}

function encryptKey(key: WorkspaceByokKey): string {
  const json = JSON.stringify(normalizeKey(key));
  if (useEncryption) {
    return safeStorage.encryptString(json).toString('base64');
  }
  return Buffer.from(json, 'utf-8').toString('base64');
}

function decryptKey(value: string): WorkspaceByokKey | null {
  try {
    const json = useEncryption
      ? safeStorage.decryptString(Buffer.from(value, 'base64'))
      : Buffer.from(value, 'base64').toString('utf-8');
    return normalizeKey(JSON.parse(json));
  } catch (e) {
    logger.warn('Failed to decrypt BYOK key, skipping', e);
    return null;
  }
}

function sortWorkspaceKeys(keys: WorkspaceByokKey[]) {
  return keys.toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function normalizeOpenAIEndpoint(endpoint?: string | null) {
  const normalized = endpoint?.trim() || 'https://api.openai.com/v1';
  return normalized.replace(/\/$/, '');
}

function sanitizeProbeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }
  return String(error).slice(0, 300);
}

async function probeOpenAIChatModel(key: WorkspaceByokKey, modelId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const endpoint = normalizeOpenAIEndpoint(key.endpoint);
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true as const, message: null };
    }

    let detail = '';
    try {
      const body = (await response.text()).slice(0, 300);
      detail = body ? ` ${body}` : '';
    } catch {
      // Ignore response body parsing failures. HTTP status is enough context.
    }

    return {
      ok: false as const,
      message: `Provider chat probe failed with HTTP ${response.status}.${detail}`,
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error && error.name === 'AbortError'
          ? 'Provider chat probe timed out.'
          : `Provider chat probe failed: ${sanitizeProbeError(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readWorkspaceKeys(workspaceId: string): WorkspaceByokKey[] {
  const encryptedKeys = byokStorage.get<string[]>(workspaceId) ?? [];
  return sortWorkspaceKeys(
    encryptedKeys.flatMap(value => {
      const key = decryptKey(value);
      return key ? [key] : [];
    })
  );
}

function writeWorkspaceKeys(workspaceId: string, keys: WorkspaceByokKey[]) {
  byokStorage.set(workspaceId, keys.map(encryptKey));
}

function toPublicKey({ apiKey: _, ...key }: WorkspaceByokKey) {
  return {
    ...key,
    storage: 'local' as const,
    configured: true,
    endpointEditable: true,
    testStatus: 'passed' as const,
  };
}

export const byokStorageHandlers = {
  isSupported: async () => true,
  listWorkspaceKeys: async (_e, workspaceId: string) => {
    return readWorkspaceKeys(workspaceId).map(toPublicKey);
  },
  getWorkspaceLeaseProviders: async (_e, workspaceId: string) => {
    return readWorkspaceKeys(workspaceId).filter(key => key.enabled !== false);
  },
  testWorkspaceChatModel: async (_e, workspaceId: string, modelId: string) => {
    const normalizedModelId = modelId.trim();
    if (!normalizedModelId) {
      return { ok: false, message: 'Model id is required.' };
    }

    const keys = readWorkspaceKeys(workspaceId).filter(
      key => key.enabled !== false && key.provider === 'openai'
    );
    if (!keys.length) {
      return {
        ok: false,
        skipped: true,
        message: 'No enabled local OpenAI-compatible provider key found.',
      };
    }

    const failures: string[] = [];
    for (const key of keys) {
      const result = await probeOpenAIChatModel(key, normalizedModelId);
      if (result.ok) {
        return {
          ok: true,
          provider: key.provider,
          keyId: key.id,
          keyName: key.name,
          message: null,
        };
      }
      failures.push(`${key.name}: ${result.message}`);
    }

    return {
      ok: false,
      message: failures.join('\n'),
    };
  },
  upsertWorkspaceKey: async (
    _e,
    workspaceId: string,
    key: WorkspaceByokKeyInput
  ) => {
    const keys = readWorkspaceKeys(workspaceId);
    const index = keys.findIndex(storedKey => storedKey.id === key.id);
    const nextKey = normalizeKey(
      key,
      index === -1 ? undefined : keys[index],
      keys.length
    );
    if (index === -1) {
      keys.push(nextKey);
    } else {
      keys[index] = nextKey;
    }
    writeWorkspaceKeys(workspaceId, keys);
    return toPublicKey(nextKey);
  },
  deleteWorkspaceKey: async (_e, workspaceId: string, keyId: string) => {
    writeWorkspaceKeys(
      workspaceId,
      readWorkspaceKeys(workspaceId).filter(key => key.id !== keyId)
    );
    return true;
  },
  reorderWorkspaceKeys: async (_e, workspaceId: string, ids: string[]) => {
    const keys = readWorkspaceKeys(workspaceId);
    const byId = new Map(keys.map(key => [key.id, key]));
    const ordered = ids
      .map((id, sortOrder) => {
        const key = byId.get(id);
        byId.delete(id);
        return key ? ({ ...key, sortOrder } as WorkspaceByokKey) : null;
      })
      .filter((key): key is WorkspaceByokKey => !!key);
    const nextKeys = sortWorkspaceKeys([
      ...ordered,
      ...Array.from(byId.values()).map((key, index) => ({
        ...key,
        sortOrder: ordered.length + index,
      })),
    ]);
    writeWorkspaceKeys(workspaceId, nextKeys);
    return nextKeys.map(toPublicKey);
  },
  clearWorkspaceKeys: async (_e, workspaceId: string) => {
    byokStorage.del(workspaceId);
    return true;
  },
} satisfies NamespaceHandlers;
