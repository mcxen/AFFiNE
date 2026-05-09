import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const tmpDir = path.join(__dirname, 'tmp-byok-storage');
let disposeWorkspaceByokStorage: (() => void) | undefined;
const generateTextMock = vi.hoisted(() => vi.fn());
const providerModelMock = vi.hoisted(() => vi.fn());
const createOpenAICompatibleMock = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpDir,
    on: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf-8'),
    decryptString: (value: Buffer) => value.toString('utf-8'),
  },
}));

beforeEach(async () => {
  vi.resetModules();
  generateTextMock.mockReset();
  providerModelMock.mockReset();
  createOpenAICompatibleMock.mockReset();
  generateTextMock.mockResolvedValue({ text: 'ok' });
  providerModelMock.mockImplementation((modelId: string) => ({ modelId }));
  createOpenAICompatibleMock.mockReturnValue(providerModelMock);
  disposeWorkspaceByokStorage = undefined;
  await fs.remove(tmpDir);
});

afterEach(async () => {
  disposeWorkspaceByokStorage?.();
  vi.resetModules();
  vi.unstubAllGlobals();
  await fs.remove(tmpDir);
});

describe('byok storage handlers', () => {
  test('stores encrypted local keys and keeps lease providers sorted', async () => {
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-openai',
      sortOrder: 1,
    });
    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-gemini',
      provider: 'gemini',
      name: 'Gemini',
      apiKey: 'sk-gemini',
      sortOrder: 0,
    });

    const list = await byokStorageHandlers.listWorkspaceKeys(
      ipcEvent,
      'workspace-1'
    );
    expect(list.map(key => key.id)).toEqual(['local-gemini', 'local-openai']);
    expect(JSON.stringify(list)).not.toContain('sk-openai');

    const reordered = await byokStorageHandlers.reorderWorkspaceKeys(
      ipcEvent,
      'workspace-1',
      ['local-openai', 'local-gemini']
    );
    expect(reordered.map(key => key.id)).toEqual([
      'local-openai',
      'local-gemini',
    ]);

    const leaseProviders = await byokStorageHandlers.getWorkspaceLeaseProviders(
      ipcEvent,
      'workspace-1'
    );
    expect(leaseProviders.map(key => key.apiKey)).toEqual([
      'sk-openai',
      'sk-gemini',
    ]);

    await byokStorageHandlers.clearWorkspaceKeys(ipcEvent, 'workspace-1');
    await expect(
      byokStorageHandlers.listWorkspaceKeys(ipcEvent, 'workspace-1')
    ).resolves.toEqual([]);
  });

  test('preserves existing local key fields during partial updates', async () => {
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      description: 'Primary key',
      apiKey: 'sk-openai',
      endpoint: 'https://api.openai.example/v1',
      sortOrder: 4,
      enabled: false,
    });

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI renamed',
      apiKey: 'sk-openai-next',
    });

    const [publicKey] = await byokStorageHandlers.listWorkspaceKeys(
      ipcEvent,
      'workspace-1'
    );
    expect(publicKey).toMatchObject({
      id: 'local-openai',
      name: 'OpenAI renamed',
      description: 'Primary key',
      endpoint: 'https://api.openai.example/v1',
      sortOrder: 4,
      enabled: false,
    });

    const [leaseProvider] =
      await byokStorageHandlers.getWorkspaceLeaseProviders(
        ipcEvent,
        'workspace-1'
      );
    expect(leaseProvider).toBeUndefined();

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI renamed again',
      enabled: true,
    });

    const [enabledLeaseProvider] =
      await byokStorageHandlers.getWorkspaceLeaseProviders(
        ipcEvent,
        'workspace-1'
      );
    expect(enabledLeaseProvider).toMatchObject({
      name: 'OpenAI renamed again',
      apiKey: 'sk-openai-next',
      endpoint: 'https://api.openai.example/v1',
      sortOrder: 4,
      enabled: true,
    });
  });

  test('probes local OpenAI-compatible chat model without exposing api keys', async () => {
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-openai',
      endpoint: 'https://api.example.com/v1/',
    });

    await expect(
      byokStorageHandlers.testWorkspaceChatModel(
        ipcEvent,
        'workspace-1',
        'deepseek-v4-pro'
      )
    ).resolves.toMatchObject({
      ok: true,
      keyId: 'local-openai',
      keyName: 'OpenAI',
    });
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith({
      name: 'affine-local-byok',
      apiKey: 'sk-openai',
      baseURL: 'https://api.example.com/v1',
    });
    expect(providerModelMock).toHaveBeenCalledWith('deepseek-v4-pro');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'deepseek-v4-pro' },
        prompt: 'ping',
        maxOutputTokens: 1,
        maxRetries: 0,
      })
    );
    expect(
      JSON.stringify(
        await byokStorageHandlers.testWorkspaceChatModel(
          ipcEvent,
          'workspace-1',
          'deepseek-v4-pro'
        )
      )
    ).not.toContain('sk-openai');
  });

  test('returns local chat probe failure details', async () => {
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;
    generateTextMock.mockRejectedValueOnce(
      new Error('HTTP 404 {"error":"model not found"}')
    );

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-openai',
    });

    await expect(
      byokStorageHandlers.testWorkspaceChatModel(
        ipcEvent,
        'workspace-1',
        'missing-model'
      )
    ).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining('HTTP 404'),
    });
  });

  test('uses AI SDK for local OpenAI-compatible chat completions', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'local answer' });
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-openai',
      endpoint: 'https://api.example.com/v1/',
    });

    await expect(
      byokStorageHandlers.chatCompletions(ipcEvent, 'workspace-1', {
        modelId: 'deepseek-v4-pro',
        content: 'Summarize this',
        contexts: {
          docs: [{ docTitle: 'Doc', docContent: 'Doc body' }],
          selectedMarkdown: 'Selected text',
        },
      })
    ).resolves.toBe('local answer');

    expect(createOpenAICompatibleMock).toHaveBeenCalledWith({
      name: 'affine-local-byok',
      apiKey: 'sk-openai',
      baseURL: 'https://api.example.com/v1',
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'deepseek-v4-pro' },
        system: expect.stringContaining('AFFiNE AI'),
        prompt: expect.stringContaining('<document title="Doc">'),
        maxRetries: 0,
      })
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('<selection>'),
      })
    );
  });

  test('falls back to other local workspace keys for desktop chat', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'fallback answer' });
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-openai',
    });

    await expect(
      byokStorageHandlers.hasWorkspaceChatProvider(ipcEvent, 'workspace-2')
    ).resolves.toBe(true);
    await expect(
      byokStorageHandlers.chatCompletions(ipcEvent, 'workspace-2', {
        modelId: 'deepseek-v4-pro',
        content: 'hello',
      })
    ).resolves.toBe('fallback answer');
  });

  test('skips local chat probe when no local OpenAI key exists', async () => {
    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;

    await expect(
      byokStorageHandlers.testWorkspaceChatModel(
        undefined,
        'workspace-1',
        'deepseek-v4-pro'
      )
    ).resolves.toMatchObject({
      ok: false,
      skipped: true,
    });
  });
});

describe('byok storage with unencrypted fallback', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('works without safeStorage encryption using base64 fallback', async () => {
    vi.doMock('electron', () => ({
      app: {
        getPath: () => tmpDir,
        on: vi.fn(),
      },
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error('not available');
        },
        decryptString: () => {
          throw new Error('not available');
        },
      },
    }));

    const { byokStorageHandlers, disposeWorkspaceByokStorage: dispose } =
      await import('@affine/electron/main/byok-storage/handlers');
    disposeWorkspaceByokStorage = dispose;
    const ipcEvent = undefined;

    const isSupported = await byokStorageHandlers.isSupported(ipcEvent);
    expect(isSupported).toBe(true);

    await byokStorageHandlers.upsertWorkspaceKey(ipcEvent, 'workspace-1', {
      id: 'local-openai',
      provider: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-openai',
      sortOrder: 0,
    });

    const list = await byokStorageHandlers.listWorkspaceKeys(
      ipcEvent,
      'workspace-1'
    );
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('local-openai');
    expect(list[0].endpointEditable).toBe(true);

    const leaseProviders = await byokStorageHandlers.getWorkspaceLeaseProviders(
      ipcEvent,
      'workspace-1'
    );
    expect(leaseProviders).toHaveLength(1);
    expect(leaseProviders[0].apiKey).toBe('sk-openai');

    vi.doUnmock('electron');
  });
});
