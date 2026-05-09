/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { type CopilotClient, Endpoint } from './copilot-client';
import { textToText, toImage } from './request';

const electronApis = vi.hoisted(() => ({
  byokStorage: undefined as
    | {
        isSupported: () => Promise<boolean>;
        getWorkspaceLeaseProviders: (workspaceId: string) => Promise<
          Array<{
            provider: string;
            name: string;
            apiKey: string;
            description?: string | null;
            endpoint?: string | null;
            sortOrder?: number | null;
            enabled?: boolean | null;
          }>
        >;
      }
    | undefined,
}));

const createWorkspaceByokLocalLeaseMutation = vi.hoisted(() =>
  Symbol('createWorkspaceByokLocalLeaseMutation')
);

vi.mock('@affine/electron-api', () => ({
  apis: electronApis,
}));

vi.mock('@affine/graphql', () => ({
  ByokProvider: {
    openai: 'openai',
    anthropic: 'anthropic',
    gemini: 'gemini',
    fal: 'fal',
  },
  createWorkspaceByokLocalLeaseMutation,
}));

class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
}

function createClient(
  overrides: Partial<
    Pick<
      CopilotClient,
      'gql' | 'createMessage' | 'chatTextStream' | 'imagesStream'
    >
  > = {}
) {
  return {
    gql: vi.fn().mockResolvedValue({
      createWorkspaceByokLocalLease: { leaseId: 'lease-1' },
    }),
    createMessage: vi.fn().mockResolvedValue('message-1'),
    chatTextStream: vi.fn(),
    imagesStream: vi.fn(),
    ...overrides,
  } as unknown as CopilotClient;
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const chunk of stream) {
    void chunk;
  }
}

describe('AI request BYOK local lease handling', () => {
  let originalEventSource: typeof globalThis.EventSource | undefined;

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
    (globalThis as any).EventSource = MockEventSource;
    vi.stubGlobal('BUILD_CONFIG', { isElectron: true });
    electronApis.byokStorage = {
      isSupported: vi.fn().mockResolvedValue(true),
      getWorkspaceLeaseProviders: vi.fn().mockResolvedValue([
        {
          provider: 'openai',
          name: 'OpenAI',
          apiKey: 'sk-local',
        },
      ]),
    };
  });

  afterEach(() => {
    (globalThis as any).EventSource = originalEventSource;
  });

  test('fails closed when local BYOK lease creation fails', async () => {
    const client = createClient({
      gql: vi.fn().mockRejectedValue(new Error('mutation failed')),
      chatTextStream: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 2,
      }),
    });

    const result = textToText({
      client,
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      content: 'hello',
    }) as Promise<string>;

    await expect(result).rejects.toThrow('Local AI provider keys');
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('fails closed when local BYOK storage support check fails', async () => {
    electronApis.byokStorage = {
      isSupported: vi.fn().mockRejectedValue(new Error('support check failed')),
      getWorkspaceLeaseProviders: vi.fn(),
    };
    const client = createClient({
      chatTextStream: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 2,
      }),
    });

    const result = textToText({
      client,
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      content: 'hello',
    }) as Promise<string>;

    await expect(result).rejects.toThrow('Local AI provider keys');
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('fails closed when local BYOK provider loading fails', async () => {
    electronApis.byokStorage = {
      isSupported: vi.fn().mockResolvedValue(true),
      getWorkspaceLeaseProviders: vi
        .fn()
        .mockRejectedValue(new Error('provider load failed')),
    };
    const client = createClient({
      chatTextStream: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 2,
      }),
    });

    const result = textToText({
      client,
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      content: 'hello',
    }) as Promise<string>;

    await expect(result).rejects.toThrow('Local AI provider keys');
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('does not create local BYOK lease after cancellation', async () => {
    const controller = new AbortController();
    const client = createClient({
      createMessage: vi.fn().mockImplementation(async () => {
        controller.abort();
        return 'message-1';
      }),
    });

    await expect(
      textToText({
        client,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        content: 'hello',
        signal: controller.signal,
      }) as Promise<string>
    ).resolves.toBe('');
    expect(client.gql).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('does not create stream local BYOK lease after cancellation', async () => {
    const controller = new AbortController();
    const client = createClient({
      createMessage: vi.fn().mockImplementation(async () => {
        controller.abort();
        return 'message-1';
      }),
    });

    await drain(
      textToText({
        client,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        content: 'hello',
        stream: true,
        signal: controller.signal,
      }) as AsyncIterable<string>
    );

    expect(client.gql).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('does not create text stream when cancelled while creating local BYOK lease', async () => {
    const controller = new AbortController();
    const client = createClient({
      gql: vi.fn().mockImplementation(async () => {
        controller.abort();
        return { createWorkspaceByokLocalLease: { leaseId: 'lease-1' } };
      }),
    });

    await drain(
      textToText({
        client,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        content: 'hello',
        stream: true,
        signal: controller.signal,
      }) as AsyncIterable<string>
    );

    expect(client.gql).toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('does not create text request when cancelled while creating local BYOK lease', async () => {
    const controller = new AbortController();
    const client = createClient({
      gql: vi.fn().mockImplementation(async () => {
        controller.abort();
        return { createWorkspaceByokLocalLease: { leaseId: 'lease-1' } };
      }),
    });

    await expect(
      textToText({
        client,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        content: 'hello',
        signal: controller.signal,
      }) as Promise<string>
    ).resolves.toBe('');

    expect(client.gql).toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('does not create image local BYOK lease after cancellation', async () => {
    const controller = new AbortController();
    const client = createClient({
      createMessage: vi.fn().mockImplementation(async () => {
        controller.abort();
        return 'message-1';
      }),
    });

    await drain(
      toImage({
        client,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        content: 'image',
        endpoint: Endpoint.Images,
        signal: controller.signal,
      }) as AsyncIterable<string>
    );

    expect(client.gql).not.toHaveBeenCalled();
    expect(client.imagesStream).not.toHaveBeenCalled();
  });

  test('does not create image stream when cancelled while creating local BYOK lease', async () => {
    const controller = new AbortController();
    const client = createClient({
      gql: vi.fn().mockImplementation(async () => {
        controller.abort();
        return { createWorkspaceByokLocalLease: { leaseId: 'lease-1' } };
      }),
    });

    await drain(
      toImage({
        client,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        content: 'image',
        endpoint: Endpoint.Images,
        signal: controller.signal,
      }) as AsyncIterable<string>
    );

    expect(client.gql).toHaveBeenCalled();
    expect(client.imagesStream).not.toHaveBeenCalled();
  });

  test('uses desktop local BYOK chat without creating a cloud lease', async () => {
    const byokStorage = {
      isSupported: vi.fn().mockResolvedValue(true),
      hasWorkspaceChatProvider: vi.fn().mockResolvedValue(true),
      getWorkspaceLeaseProviders: vi.fn(),
      chatCompletions: vi.fn().mockResolvedValue('local answer'),
    } as any;
    electronApis.byokStorage = byokStorage;
    const client = createClient({
      chatTextStream: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        close: vi.fn(),
        readyState: 2,
      }),
    });

    const result = textToText({
      client,
      sessionId: 'local-session-1',
      workspaceId: 'workspace-1',
      content: 'hello',
      modelId: 'deepseek-v4-pro',
    }) as Promise<string>;

    await expect(result).resolves.toBe('local answer');
    expect(client.gql).not.toHaveBeenCalled();
    expect(client.createMessage).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
    expect(byokStorage.chatCompletions).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({
        modelId: 'deepseek-v4-pro',
        content: 'hello',
      })
    );
  });
});
