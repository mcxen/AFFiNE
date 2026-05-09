/**
 * @vitest-environment happy-dom
 */
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AIProvider } from './ai-provider';
import { CopilotClient, Endpoint } from './copilot-client';
import { setupAIProvider } from './setup-provider';

const electronApis = vi.hoisted(() => ({
  byokStorage: undefined as
    | {
        isSupported: () => Promise<boolean>;
        hasWorkspaceChatProvider: (workspaceId: string) => Promise<boolean>;
        chatCompletions?: (
          workspaceId: string,
          input: { modelId?: string; content?: string }
        ) => Promise<string>;
      }
    | undefined,
}));

vi.mock('@affine/electron-api', () => ({
  apis: electronApis,
}));

Object.defineProperty(globalThis, 'EventSource', {
  configurable: true,
  value: {
    CLOSED: 2,
  },
});

type SetupAIProviderArgs = Parameters<typeof setupAIProvider>;
type ActionInput<T extends keyof BlockSuitePresets.AIActions> = Parameters<
  NonNullable<BlockSuitePresets.AIActions[T]>
>[0];

async function drain(stream: AsyncIterable<unknown>) {
  for await (const chunk of stream) {
    void chunk;
  }
}

async function drainActionResult(
  stream: string | AsyncIterable<unknown> | undefined
) {
  expect(stream).toBeDefined();
  expect(typeof stream).not.toBe('string');
  await drain(stream as AsyncIterable<unknown>);
}

function createClosedEventSource(): EventSource {
  return {
    readyState: EventSource.CLOSED,
    addEventListener: vi.fn(),
    close: vi.fn(),
  } as unknown as EventSource;
}

describe('setupAIProvider action migrations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    electronApis.byokStorage = undefined;
  });

  test('routes mindmap, slides and image filter through action API', async () => {
    const createdSessions: unknown[] = [];
    const textStreams: unknown[] = [];
    const client = new CopilotClient(
      vi.fn(),
      vi.fn(() => createClosedEventSource())
    );
    vi.spyOn(client, 'createSession').mockImplementation(async options => {
      createdSessions.push(options);
      return `session:${options.promptName}`;
    });
    vi.spyOn(client, 'createMessage').mockResolvedValue('message-1');
    vi.spyOn(client, 'chatTextStream').mockImplementation(
      (options, endpoint) => {
        textStreams.push({ options, endpoint });
        return createClosedEventSource();
      }
    );
    vi.spyOn(client, 'imagesStream').mockReturnValue(createClosedEventSource());

    setupAIProvider(
      client,
      { open: vi.fn() } as unknown as SetupAIProviderArgs[1],
      {
        session: {
          account$: new BehaviorSubject(null),
        },
      } as unknown as SetupAIProviderArgs[2]
    );

    await drainActionResult(
      await AIProvider.actions.brainstormMindmap?.({
        workspaceId: 'workspace-1',
        input: 'make a map',
        stream: true,
      } satisfies ActionInput<'brainstormMindmap'>)
    );
    await drainActionResult(
      await AIProvider.actions.createSlides?.({
        workspaceId: 'workspace-1',
        input: 'make slides',
        stream: true,
      } satisfies ActionInput<'createSlides'>)
    );
    await drainActionResult(
      await AIProvider.actions.filterImage?.({
        workspaceId: 'workspace-1',
        input: 'convert',
        attachments: ['blob-1'],
        style: 'Sketch style',
      } satisfies ActionInput<'filterImage'>)
    );

    expect(createdSessions).toEqual([
      expect.objectContaining({ promptName: 'mindmap.generate' }),
      expect.objectContaining({ promptName: 'slides.outline' }),
      expect.objectContaining({ promptName: 'image.filter.sketch' }),
    ]);
    expect(textStreams).toEqual([
      expect.objectContaining({
        endpoint: Endpoint.Action,
        options: expect.objectContaining({ actionId: 'mindmap.generate' }),
      }),
      expect.objectContaining({
        endpoint: Endpoint.Action,
        options: expect.objectContaining({ actionId: 'slides.outline' }),
      }),
      expect.objectContaining({
        endpoint: Endpoint.Action,
        options: expect.objectContaining({ actionId: 'image.filter.sketch' }),
      }),
    ]);
    expect(client.imagesStream).not.toHaveBeenCalled();
  });

  test('keeps local BYOK chat metadata off the cloud API', async () => {
    vi.stubGlobal('BUILD_CONFIG', { isElectron: true });
    electronApis.byokStorage = {
      isSupported: vi.fn().mockResolvedValue(true),
      hasWorkspaceChatProvider: vi.fn().mockResolvedValue(true),
    };

    const client = new CopilotClient(
      vi.fn(),
      vi.fn(() => createClosedEventSource())
    );
    vi.spyOn(client, 'getSessions').mockResolvedValue([]);
    vi.spyOn(client, 'getRecentSessions').mockResolvedValue([]);
    vi.spyOn(client, 'getHistories').mockResolvedValue([]);
    vi.spyOn(client, 'getHistoryIds').mockResolvedValue([]);
    vi.spyOn(client, 'cleanupSessions').mockResolvedValue([]);
    vi.spyOn(client, 'getContextId').mockResolvedValue(undefined);
    vi.spyOn(client, 'createContext').mockResolvedValue('context-1');
    vi.spyOn(client, 'getContextDocsAndFiles').mockResolvedValue(undefined);
    vi.spyOn(client, 'getEmbeddingStatus').mockResolvedValue({
      embedded: 0,
      total: 0,
    });
    vi.spyOn(client, 'matchContext').mockResolvedValue({
      files: undefined,
      docs: undefined,
    });

    setupAIProvider(
      client,
      { open: vi.fn() } as unknown as SetupAIProviderArgs[1],
      {
        session: {
          account$: new BehaviorSubject(null),
        },
      } as unknown as SetupAIProviderArgs[2]
    );

    await expect(
      AIProvider.session?.getSessions?.('workspace-1')
    ).resolves.toEqual([]);
    await expect(
      AIProvider.session?.getRecentSessions?.('workspace-1')
    ).resolves.toEqual([]);
    await expect(
      AIProvider.histories?.chats?.('workspace-1', 'local-session-1')
    ).resolves.toEqual([]);
    await expect(
      AIProvider.histories?.actions?.('workspace-1', 'doc-1')
    ).resolves.toEqual([]);
    await expect(
      AIProvider.histories?.ids?.('workspace-1', 'doc-1')
    ).resolves.toEqual([]);
    await expect(
      AIProvider.context?.getContextId?.('workspace-1', 'local-session-1')
    ).resolves.toBeUndefined();
    await expect(
      AIProvider.context?.getContextDocsAndFiles?.(
        'workspace-1',
        'local-session-1',
        'context-1'
      )
    ).resolves.toEqual({
      docs: [],
      files: [],
      tags: [],
      collections: [],
      blobs: [],
    });
    await expect(
      AIProvider.context?.matchContext?.('hello', undefined, 'workspace-1')
    ).resolves.toEqual({});
    await AIProvider.context?.pollEmbeddingStatus?.(
      'workspace-1',
      vi.fn(),
      new AbortController().signal
    );
    await AIProvider.histories?.cleanup?.('workspace-1', undefined, [
      'local-session-1',
    ]);

    expect(client.getSessions).not.toHaveBeenCalled();
    expect(client.getRecentSessions).not.toHaveBeenCalled();
    expect(client.getHistories).not.toHaveBeenCalled();
    expect(client.getHistoryIds).not.toHaveBeenCalled();
    expect(client.cleanupSessions).not.toHaveBeenCalled();
    expect(client.getContextId).not.toHaveBeenCalled();
    expect(client.getContextDocsAndFiles).not.toHaveBeenCalled();
    expect(client.getEmbeddingStatus).not.toHaveBeenCalled();
    expect(client.matchContext).not.toHaveBeenCalled();
  });

  test('routes selected-text editing actions through local BYOK', async () => {
    vi.stubGlobal('BUILD_CONFIG', { isElectron: true });
    electronApis.byokStorage = {
      isSupported: vi.fn().mockResolvedValue(true),
      hasWorkspaceChatProvider: vi.fn().mockResolvedValue(true),
      chatCompletions: vi.fn().mockResolvedValue('local rewrite'),
    };

    const client = new CopilotClient(
      vi.fn(),
      vi.fn(() => createClosedEventSource())
    );
    vi.spyOn(client, 'createSession').mockResolvedValue('cloud-session');
    vi.spyOn(client, 'createMessage').mockResolvedValue('cloud-message');
    vi.spyOn(client, 'chatTextStream').mockReturnValue(
      createClosedEventSource()
    );

    setupAIProvider(
      client,
      { open: vi.fn() } as unknown as SetupAIProviderArgs[1],
      {
        session: {
          account$: new BehaviorSubject(null),
        },
      } as unknown as SetupAIProviderArgs[2],
      {
        getModelId: () => 'local-test-model',
      } as unknown as SetupAIProviderArgs[3]
    );

    const result = await AIProvider.actions.improveWriting?.({
      workspaceId: 'workspace-1',
      input: 'selected text',
      stream: true,
    } satisfies ActionInput<'improveWriting'>);

    const chunks: unknown[] = [];
    for await (const chunk of result as AsyncIterable<unknown>) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['local rewrite']);
    expect(electronApis.byokStorage.chatCompletions).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({
        modelId: 'local-test-model',
        content: 'selected text',
      })
    );
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.createMessage).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });
});
