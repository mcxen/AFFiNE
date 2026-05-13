import { toggleGeneralAIOnboarding } from '@affine/core/components/affine/ai-onboarding/apis';
import type { AIModelService } from '@affine/core/modules/ai-button/services/models';
import type { AuthAccountInfo, AuthService } from '@affine/core/modules/cloud';
import type { GlobalDialogService } from '@affine/core/modules/dialogs';
import { apis } from '@affine/electron-api';
import {
  type AddContextFileInput,
  ContextCategories,
  type ContextWorkspaceEmbeddingStatus,
  type getCopilotHistoriesQuery,
  type QueryChatSessionsInput,
  type RequestOptions,
  type UpdateChatSessionInput,
} from '@affine/graphql';

import { AIProvider } from './ai-provider';
import { type CopilotClient, Endpoint } from './copilot-client';
import type { PromptKey } from './prompt';
import { textToText, toImage } from './request';
import { setupTracker } from './tracker';

function toAIUserInfo(account: AuthAccountInfo | null) {
  if (!account) return null;
  return {
    avatarUrl: account.avatar ?? '',
    email: account.email ?? '',
    id: account.id,
    name: account.label,
  };
}

function isLocalBuild() {
  return (
    typeof BUILD_CONFIG !== 'undefined' &&
    (BUILD_CONFIG.isElectron || BUILD_CONFIG.isMobileEdition)
  );
}

async function hasLocalChatProvider(workspaceId?: string) {
  const storage = isLocalBuild() ? apis?.byokStorage : undefined;
  if (!workspaceId || !storage) {
    return false;
  }
  if (typeof storage.hasWorkspaceChatProvider !== 'function') {
    return false;
  }
  try {
    return (
      (await storage.isSupported()) &&
      (await storage.hasWorkspaceChatProvider(workspaceId))
    );
  } catch {
    return false;
  }
}

function isLocalSessionId(sessionId?: string) {
  return !!sessionId?.startsWith('local-');
}

async function shouldUseLocalAI(workspaceId?: string, sessionId?: string) {
  return (
    isLocalSessionId(sessionId) || (await hasLocalChatProvider(workspaceId))
  );
}

type LocalChatMessageRecord = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type LocalChatSessionRecord = {
  sessionId: string;
  workspaceId: string;
  docId?: string | null;
  promptName?: string;
  model?: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  messages: LocalChatMessageRecord[];
};

function chatHistoryApi(): any {
  return isLocalBuild() ? (apis as any)?.chatHistory : undefined;
}

async function readLocalSession(
  workspaceId: string,
  sessionId: string
): Promise<LocalChatSessionRecord | null> {
  const api = chatHistoryApi();
  if (!api?.getSession) return null;
  try {
    return (await api.getSession(workspaceId, sessionId)) ?? null;
  } catch {
    return null;
  }
}

async function listLocalSessions(
  workspaceId: string,
  docId?: string
): Promise<LocalChatSessionRecord[]> {
  const api = chatHistoryApi();
  if (!api?.listSessions) return [];
  try {
    return (await api.listSessions(workspaceId, { docId })) ?? [];
  } catch {
    return [];
  }
}

function toAIHistory(session: LocalChatSessionRecord): any {
  return {
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    docId: session.docId ?? null,
    promptName: session.promptName ?? 'Chat With AFFiNE AI',
    model: session.model ?? 'local',
    action: null,
    pinned: false,
    title: session.title ?? null,
    tokens: 0,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      attachments: [],
      streamObjects: null,
    })),
  };
}

function createLocalSession(
  options: BlockSuitePresets.AICreateSessionOptions,
  sessionId = `local-${crypto.randomUUID()}`
) {
  const now = new Date().toISOString();
  return {
    __typename: 'CopilotHistories' as const,
    sessionId,
    workspaceId: options.workspaceId,
    docId: options.docId ?? null,
    parentSessionId: null,
    promptName: options.promptName,
    model: 'local',
    optionalModels: [],
    action: null,
    pinned: false,
    title: null,
    tokens: 0,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createEmptyLocalContext(): BlockSuitePresets.AIDocsAndFilesContext {
  return {
    docs: [],
    files: [],
    tags: [],
    collections: [],
    blobs: [],
  };
}

const filterStyleToPromptName = new Map<string, PromptKey>(
  Object.entries({
    'Clay style': 'image.filter.clay',
    'Pixel style': 'image.filter.pixel',
    'Sketch style': 'image.filter.sketch',
    'Anime style': 'image.filter.anime',
  })
);

const processTypeToPromptName = new Map<string, PromptKey>(
  Object.entries({
    Clearer: 'Upscale image',
    'Remove background': 'Remove background',
    'Convert to sticker': 'Convert to sticker',
  })
);

export function setupAIProvider(
  client: CopilotClient,
  globalDialogService: GlobalDialogService,
  authService: AuthService,
  aiModelService?: AIModelService
) {
  async function createSession({
    promptName,
    workspaceId,
    docId,
    sessionId,
    retry,
    pinned,
    reuseLatestChat,
  }: BlockSuitePresets.AICreateSessionOptions) {
    if (sessionId) return sessionId;
    if (retry) return AIProvider.LAST_ACTION_SESSIONID;
    if (await hasLocalChatProvider(workspaceId)) {
      return `local-${crypto.randomUUID()}`;
    }

    return client.createSession({
      workspaceId,
      docId,
      promptName,
      pinned,
      reuseLatestChat,
    });
  }

  AIProvider.provide('userInfo', () => {
    return toAIUserInfo(authService.session.account$.value);
  });

  const accountSubscription = authService.session.account$.subscribe(
    account => {
      AIProvider.slots.userInfo.next(toAIUserInfo(account));
    }
  );

  //#region actions
  AIProvider.provide('chat', async options => {
    const { input, contexts } = options;

    const sessionId = await createSession({
      promptName: 'Chat With AFFiNE AI',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: input,
      timeout: 5 * 60 * 1000, // 5 minutes
      params: {
        docs: contexts?.docs,
        files: contexts?.files,
        selectedSnapshot: contexts?.selectedSnapshot,
        selectedMarkdown: contexts?.selectedMarkdown,
        html: contexts?.html,
        ...(options.docId ? { currentDocId: options.docId } : {}),
      },
      endpoint: Endpoint.StreamObject,
    });
  });

  AIProvider.provide('summary', async options => {
    const sessionId = await createSession({
      promptName: 'Summary',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('translate', async options => {
    const sessionId = await createSession({
      promptName: 'Translate to',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
      params: {
        language: options.lang,
      },
    });
  });

  AIProvider.provide('changeTone', async options => {
    const sessionId = await createSession({
      promptName: 'Change tone to',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      params: {
        tone: options.tone.toLowerCase(),
      },
      content: options.input,
    });
  });

  AIProvider.provide('improveWriting', async options => {
    const sessionId = await createSession({
      promptName: 'Improve writing for it',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('improveGrammar', async options => {
    const sessionId = await createSession({
      promptName: 'Improve grammar for it',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('fixSpelling', async options => {
    const sessionId = await createSession({
      promptName: 'Fix spelling for it',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('createHeadings', async options => {
    const sessionId = await createSession({
      promptName: 'Create headings',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('makeLonger', async options => {
    const sessionId = await createSession({
      promptName: 'Make it longer',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('makeShorter', async options => {
    const sessionId = await createSession({
      promptName: 'Make it shorter',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('checkCodeErrors', async options => {
    const sessionId = await createSession({
      promptName: 'Check code error',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('explainCode', async options => {
    const sessionId = await createSession({
      promptName: 'Explain this code',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writeArticle', async options => {
    const sessionId = await createSession({
      promptName: 'Write an article about this',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writeTwitterPost', async options => {
    const sessionId = await createSession({
      promptName: 'Write a twitter about this',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writePoem', async options => {
    const sessionId = await createSession({
      promptName: 'Write a poem about this',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writeOutline', async options => {
    const sessionId = await createSession({
      promptName: 'Write outline',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('writeBlogPost', async options => {
    const sessionId = await createSession({
      promptName: 'Write a blog post about this',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('brainstorm', async options => {
    const sessionId = await createSession({
      promptName: 'Brainstorm ideas about this',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('findActions', async options => {
    const sessionId = await createSession({
      promptName: 'Find action items from it',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('brainstormMindmap', async options => {
    const sessionId = await createSession({
      promptName: 'mindmap.generate',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
      // 3 minutes
      timeout: 180000,
      endpoint: Endpoint.Action,
      actionId: 'mindmap.generate',
      actionVersion: 'v1',
    });
  });

  AIProvider.provide('expandMindmap', async options => {
    if (!options.input) {
      throw new Error('expandMindmap action requires input');
    }
    const sessionId = await createSession({
      promptName: 'Expand mind map',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      params: {
        mindmap: options.mindmap,
        node: options.input,
      },
      content: options.input,
    });
  });

  AIProvider.provide('explain', async options => {
    const sessionId = await createSession({
      promptName: 'Explain this',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('explainImage', async options => {
    const sessionId = await createSession({
      promptName: 'Explain this image',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('makeItReal', async options => {
    let promptName: PromptKey = 'Make it real';
    let content = options.input || '';

    // wireframes
    if (options.attachments?.length) {
      content = `Here are the latest wireframes. Could you make a new website based on these wireframes and notes and send back just the html file?
Here are our design notes:\n ${content}.`;
    } else {
      // notes
      promptName = 'Make it real with text';
      content = `Here are the latest notes: \n ${content}.
Could you make a new website based on these notes and send back just the html file?`;
    }

    const sessionId = await createSession({
      promptName,
      ...options,
    });

    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content,
    });
  });

  AIProvider.provide('createSlides', async options => {
    const sessionId = await createSession({
      promptName: 'slides.outline',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
      // 3 minutes
      timeout: 180000,
      endpoint: Endpoint.Action,
      actionId: 'slides.outline',
      actionVersion: 'v1',
    });
  });

  AIProvider.provide('createImage', async options => {
    const sessionId = await createSession({
      promptName: 'Generate image',
      ...options,
    });
    return toImage({
      ...options,
      client,
      sessionId,
      content:
        !options.input && options.attachments
          ? 'Make the image more detailed.'
          : options.input,
      // 5 minutes
      timeout: 300000,
    });
  });

  AIProvider.provide('filterImage', async options => {
    // test to image
    const promptName: PromptKey | undefined = filterStyleToPromptName.get(
      options.style
    );
    if (!promptName) {
      throw new Error('filterImage requires a promptName');
    }
    const sessionId = await createSession({
      promptName,
      ...options,
    });
    return toImage({
      ...options,
      client,
      sessionId,
      content: options.input,
      timeout: 180000,
      endpoint: Endpoint.Action,
      actionId: promptName,
      actionVersion: 'v1',
    });
  });

  AIProvider.provide('processImage', async options => {
    // test to image
    const promptName: PromptKey | undefined = processTypeToPromptName.get(
      options.type
    );
    if (!promptName) {
      throw new Error('processImage requires a promptName');
    }
    const sessionId = await createSession({
      promptName,
      ...options,
    });
    return toImage({
      ...options,
      client,
      sessionId,
      content: options.input,
      timeout: 180000,
    });
  });

  AIProvider.provide('generateCaption', async options => {
    const sessionId = await createSession({
      promptName: 'Generate a caption',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });

  AIProvider.provide('continueWriting', async options => {
    const sessionId = await createSession({
      promptName: 'Continue writing',
      ...options,
    });
    return textToText({
      ...options,
      modelId: options.modelId ?? aiModelService?.getModelId(),
      client,
      sessionId,
      content: options.input,
    });
  });
  //#endregion

  AIProvider.provide('session', {
    createSession,
    createSessionWithHistory: async options => {
      if (await hasLocalChatProvider(options.workspaceId)) {
        return createLocalSession(options);
      }

      if (!options.sessionId && !options.retry) {
        return client.createSessionWithHistory({
          workspaceId: options.workspaceId,
          docId: options.docId,
          promptName: options.promptName,
          pinned: options.pinned,
          reuseLatestChat: options.reuseLatestChat,
        });
      }

      const sessionId = await createSession(options);
      if (!sessionId) return undefined;
      return client.getSession(options.workspaceId, sessionId);
    },
    getSession: async (workspaceId: string, sessionId: string) => {
      if (isLocalSessionId(sessionId)) {
        const session = await readLocalSession(workspaceId, sessionId);
        if (session) {
          return {
            __typename: 'CopilotHistories' as const,
            sessionId: session.sessionId,
            workspaceId: session.workspaceId,
            docId: session.docId ?? null,
            parentSessionId: null,
            promptName: session.promptName ?? 'Chat With AFFiNE AI',
            model: session.model ?? 'local',
            optionalModels: [],
            action: null,
            pinned: false,
            title: session.title ?? null,
            tokens: 0,
            messages: session.messages.map(m => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
              attachments: [],
              streamObjects: null,
            })),
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          } as any;
        }
        return createLocalSession({
          workspaceId,
          sessionId,
          promptName: 'Chat With AFFiNE AI',
        });
      }
      return client.getSession(workspaceId, sessionId);
    },
    getSessions: async (
      workspaceId: string,
      docId?: string,
      options?: QueryChatSessionsInput
    ) => {
      if (await hasLocalChatProvider(workspaceId)) {
        const sessions = await listLocalSessions(workspaceId, docId);
        return sessions.map(s => ({
          id: s.sessionId,
          sessionId: s.sessionId,
          workspaceId: s.workspaceId,
          docId: s.docId ?? null,
          parentSessionId: null,
          promptName: s.promptName ?? 'Chat With AFFiNE AI',
          model: s.model ?? 'local',
          optionalModels: [],
          action: null,
          pinned: false,
          title: s.title ?? null,
          tokens: 0,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })) as any;
      }
      return client.getSessions(workspaceId, {}, docId, options);
    },
    getRecentSessions: async (
      workspaceId: string,
      limit?: number,
      offset?: number
    ) => {
      if (await hasLocalChatProvider(workspaceId)) {
        const sessions = await listLocalSessions(workspaceId);
        return sessions.slice(offset ?? 0, (offset ?? 0) + (limit ?? 20)).map(
          s =>
            ({
              id: s.sessionId,
              sessionId: s.sessionId,
              workspaceId: s.workspaceId,
              docId: s.docId ?? null,
              parentSessionId: null,
              promptName: s.promptName ?? 'Chat With AFFiNE AI',
              model: s.model ?? 'local',
              optionalModels: [],
              action: null,
              pinned: false,
              title: s.title ?? null,
              tokens: 0,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
            }) as any
        );
      }
      return client.getRecentSessions(workspaceId, limit, offset);
    },
    updateSession: async (options: UpdateChatSessionInput) => {
      if (isLocalSessionId(options.sessionId)) {
        return options.sessionId;
      }
      return client.updateSession(options);
    },
  });

  AIProvider.provide('context', {
    createContext: async (workspaceId: string, sessionId: string) => {
      if (await shouldUseLocalAI(workspaceId, sessionId)) {
        return `local-context-${sessionId}`;
      }
      return client.createContext(workspaceId, sessionId);
    },
    getContextId: async (workspaceId: string, sessionId: string) => {
      if (await shouldUseLocalAI(workspaceId, sessionId)) {
        return undefined;
      }
      return client.getContextId(workspaceId, sessionId);
    },
    addContextDoc: async (options: { contextId: string; docId: string }) => {
      return client.addContextDoc(options);
    },
    removeContextDoc: async (options: { contextId: string; docId: string }) => {
      return client.removeContextDoc(options);
    },
    addContextFile: async (file: File, options: AddContextFileInput) => {
      return client.addContextFile(file, options);
    },
    removeContextFile: async (options: {
      contextId: string;
      fileId: string;
    }) => {
      return client.removeContextFile(options);
    },
    addContextTag: async (options: {
      contextId: string;
      tagId: string;
      docIds: string[];
    }) => {
      return client.addContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Tag,
        categoryId: options.tagId,
        docs: options.docIds,
      });
    },
    removeContextTag: async (options: { contextId: string; tagId: string }) => {
      return client.removeContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Tag,
        categoryId: options.tagId,
      });
    },
    addContextCollection: async (options: {
      contextId: string;
      collectionId: string;
      docIds: string[];
    }) => {
      return client.addContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Collection,
        categoryId: options.collectionId,
        docs: options.docIds,
      });
    },
    removeContextCollection: async (options: {
      contextId: string;
      collectionId: string;
    }) => {
      return client.removeContextCategory({
        contextId: options.contextId,
        type: ContextCategories.Collection,
        categoryId: options.collectionId,
      });
    },
    getContextDocsAndFiles: async (
      workspaceId: string,
      sessionId: string,
      contextId: string
    ) => {
      if (await shouldUseLocalAI(workspaceId, sessionId)) {
        return createEmptyLocalContext();
      }
      return client.getContextDocsAndFiles(workspaceId, sessionId, contextId);
    },
    pollContextDocsAndFiles: async (
      workspaceId: string,
      sessionId: string,
      contextId: string,
      onPoll: (
        result: BlockSuitePresets.AIDocsAndFilesContext | undefined
      ) => void,
      abortSignal: AbortSignal
    ) => {
      if (await shouldUseLocalAI(workspaceId, sessionId)) {
        onPoll(createEmptyLocalContext());
        return;
      }
      const poll = async () => {
        const result = await client.getContextDocsAndFiles(
          workspaceId,
          sessionId,
          contextId
        );
        onPoll(result);
      };

      let attempts = 0;
      const MIN_INTERVAL = 1000;
      const MAX_INTERVAL = 30 * 1000;

      while (!abortSignal.aborted) {
        await poll();
        const interval = Math.min(
          MIN_INTERVAL * Math.pow(1.5, attempts),
          MAX_INTERVAL
        );
        attempts++;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    },
    pollEmbeddingStatus: async (
      workspaceId: string,
      onPoll: (result: ContextWorkspaceEmbeddingStatus) => void,
      abortSignal: AbortSignal
    ) => {
      if (await hasLocalChatProvider(workspaceId)) {
        onPoll({
          embedded: 0,
          total: 0,
        });
        return;
      }
      const poll = async () => {
        const result = await client.getEmbeddingStatus(workspaceId);
        onPoll(result);
      };

      const INTERVAL = 10 * 1000;

      while (!abortSignal.aborted) {
        await poll();
        await new Promise(resolve => setTimeout(resolve, INTERVAL));
      }
    },
    matchContext: async (
      content: string,
      contextId?: string,
      workspaceId?: string,
      limit?: number,
      scopedThreshold?: number,
      threshold?: number
    ) => {
      if (await hasLocalChatProvider(workspaceId)) {
        return {};
      }
      return client.matchContext(
        content,
        contextId,
        workspaceId,
        limit,
        scopedThreshold,
        threshold
      );
    },
    addContextBlob: async (options: { blobId: string; contextId: string }) => {
      return client.addContextBlob({
        contextId: options.contextId,
        blobId: options.blobId,
      });
    },
    removeContextBlob: async (options: {
      blobId: string;
      contextId: string;
    }) => {
      return client.removeContextBlob({
        contextId: options.contextId,
        blobId: options.blobId,
      });
    },
  });

  AIProvider.provide('histories', {
    actions: async (
      workspaceId: string,
      docId: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      if (await hasLocalChatProvider(workspaceId)) {
        return [];
      }
      // @ts-expect-error - 'action' is missing in server impl
      return (
        (await client.getHistories(workspaceId, {}, docId, {
          action: true,
          withPrompt: true,
          withMessages: true,
        })) ?? []
      );
    },
    chats: async (
      workspaceId: string,
      sessionId: string,
      docId?: string
    ): Promise<BlockSuitePresets.AIHistory[]> => {
      // For local sessions, load from local chat history storage
      if (isLocalSessionId(sessionId)) {
        const session = await readLocalSession(workspaceId, sessionId);
        return session ? [toAIHistory(session)] : [];
      }
      // If local chat provider is enabled but no specific session, list all local sessions
      if (await hasLocalChatProvider(workspaceId)) {
        const sessions = await listLocalSessions(workspaceId, docId);
        return sessions.map(toAIHistory);
      }
      // @ts-expect-error - 'action' is missing in server impl
      return (
        (await client.getHistories(workspaceId, {}, docId, {
          sessionId,
          withMessages: true,
        })) ?? []
      );
    },
    cleanup: async (
      workspaceId: string,
      docId: string | undefined,
      sessionIds: string[]
    ) => {
      // Delete local sessions if any
      const localIds = sessionIds.filter(isLocalSessionId);
      if (localIds.length) {
        const api = chatHistoryApi();
        if (api?.deleteSessions) {
          await api.deleteSessions(workspaceId, localIds).catch(() => {});
        }
      }
      const serverIds = sessionIds.filter(id => !isLocalSessionId(id));
      if (!serverIds.length) return;
      if (await hasLocalChatProvider(workspaceId)) return;
      await client.cleanupSessions({
        workspaceId,
        docId,
        sessionIds: serverIds,
      });
    },
    ids: async (
      workspaceId: string,
      docId?: string,
      options?: RequestOptions<
        typeof getCopilotHistoriesQuery
      >['variables']['options']
    ): Promise<BlockSuitePresets.AIHistoryIds[]> => {
      if (await hasLocalChatProvider(workspaceId)) {
        const sessions = await listLocalSessions(workspaceId, docId);
        return sessions.map(
          s =>
            ({
              sessionId: s.sessionId,
              messages: s.messages.map(m => ({
                id: m.id,
                role: m.role,
                createdAt: m.createdAt,
              })),
            }) as any
        );
      }
      // @ts-expect-error - 'action' is missing in server impl
      return await client.getHistoryIds(workspaceId, {}, docId, options);
    },
    updateMessage: async (
      workspaceId: string,
      sessionId: string,
      messageId: string,
      content: string
    ): Promise<boolean> => {
      if (isLocalSessionId(sessionId)) {
        const api = chatHistoryApi();
        if (!api?.updateMessage) return false;
        return api.updateMessage(workspaceId, sessionId, messageId, content);
      }
      return false;
    },
  });

  AIProvider.provide('photoEngine', {
    async searchImages(options): Promise<string[]> {
      let url = '/api/copilot/unsplash/photos';
      if (options.query) {
        url += `?query=${encodeURIComponent(options.query)}`;
      }
      const result: {
        results?: {
          urls: {
            regular: string;
          };
        }[];
      } = await fetch(url.toString()).then((res: Response) => res.json());
      if (!result.results) return [];
      return result.results.map(r => {
        const url = new URL(r.urls.regular);
        url.searchParams.set('fit', 'crop');
        url.searchParams.set('crop', 'edges');
        url.searchParams.set('dpr', (window.devicePixelRatio ?? 2).toString());
        url.searchParams.set('w', `${options.width}`);
        url.searchParams.set('h', `${options.height}`);
        return url.toString();
      });
    },
  });

  AIProvider.provide('onboarding', toggleGeneralAIOnboarding);

  AIProvider.provide('forkChat', options => {
    return client.forkSession(options);
  });

  const disposeRequestLoginHandler = AIProvider.slots.requestLogin.subscribe(
    () => {
      globalDialogService.open('sign-in', {});
    }
  );

  setupTracker();

  return () => {
    disposeRequestLoginHandler.unsubscribe();
    accountSubscription.unsubscribe();
  };
}
