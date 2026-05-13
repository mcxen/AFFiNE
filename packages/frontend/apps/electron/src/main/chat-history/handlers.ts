import path from 'node:path';

import { app } from 'electron';

import { PersistentJSONFileStorage } from '../shared-storage/json-file';
import type { NamespaceHandlers } from '../type';

const chatHistoryStorage = new PersistentJSONFileStorage(
  path.join(app.getPath('userData'), 'local-chat-history.json')
);

export function disposeLocalChatHistory() {
  chatHistoryStorage.dispose();
}

export type LocalChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachments?: string[];
  streamObjects?: unknown;
};

export type LocalChatSession = {
  sessionId: string;
  workspaceId: string;
  docId?: string | null;
  promptName?: string;
  model?: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  messages: LocalChatMessage[];
};

type WorkspaceSessions = Record<string, LocalChatSession>;

const MAX_SESSIONS_PER_WORKSPACE = 200;
const MAX_MESSAGES_PER_SESSION = 500;

function readWorkspaceSessions(workspaceId: string): WorkspaceSessions {
  return chatHistoryStorage.get<WorkspaceSessions>(workspaceId) ?? {};
}

function writeWorkspaceSessions(
  workspaceId: string,
  sessions: WorkspaceSessions
) {
  chatHistoryStorage.set(workspaceId, sessions);
}

function trimSessions(sessions: WorkspaceSessions): WorkspaceSessions {
  const entries = Object.values(sessions);
  if (entries.length <= MAX_SESSIONS_PER_WORKSPACE) return sessions;
  const sorted = entries.sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
  const kept = sorted.slice(0, MAX_SESSIONS_PER_WORKSPACE);
  return Object.fromEntries(kept.map(s => [s.sessionId, s]));
}

export const chatHistoryHandlers = {
  appendMessage: async (
    _e,
    workspaceId: string,
    session: {
      sessionId: string;
      docId?: string | null;
      promptName?: string;
      model?: string;
    },
    message: LocalChatMessage
  ): Promise<boolean> => {
    const sessions = readWorkspaceSessions(workspaceId);
    const now = new Date().toISOString();
    const existing = sessions[session.sessionId];
    const next: LocalChatSession = existing
      ? {
          ...existing,
          updatedAt: now,
          messages: [...existing.messages, message].slice(
            -MAX_MESSAGES_PER_SESSION
          ),
        }
      : {
          sessionId: session.sessionId,
          workspaceId,
          docId: session.docId ?? null,
          promptName: session.promptName,
          model: session.model ?? 'local',
          title: null,
          createdAt: now,
          updatedAt: now,
          messages: [message],
        };
    sessions[session.sessionId] = next;
    writeWorkspaceSessions(workspaceId, trimSessions(sessions));
    return true;
  },
  getSession: async (
    _e,
    workspaceId: string,
    sessionId: string
  ): Promise<LocalChatSession | null> => {
    return readWorkspaceSessions(workspaceId)[sessionId] ?? null;
  },
  listSessions: async (
    _e,
    workspaceId: string,
    options?: { docId?: string | null; limit?: number; offset?: number }
  ): Promise<LocalChatSession[]> => {
    const all = Object.values(readWorkspaceSessions(workspaceId));
    const filtered = options?.docId
      ? all.filter(s => s.docId === options.docId)
      : all;
    const sorted = filtered.sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    );
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? sorted.length;
    return sorted.slice(offset, offset + limit);
  },
  deleteSessions: async (
    _e,
    workspaceId: string,
    sessionIds: string[]
  ): Promise<boolean> => {
    const sessions = readWorkspaceSessions(workspaceId);
    for (const id of sessionIds) delete sessions[id];
    writeWorkspaceSessions(workspaceId, sessions);
    return true;
  },
  clearWorkspace: async (_e, workspaceId: string): Promise<boolean> => {
    chatHistoryStorage.del(workspaceId);
    return true;
  },
  updateSessionTitle: async (
    _e,
    workspaceId: string,
    sessionId: string,
    title: string
  ): Promise<boolean> => {
    const sessions = readWorkspaceSessions(workspaceId);
    const s = sessions[sessionId];
    if (!s) return false;
    sessions[sessionId] = {
      ...s,
      title,
      updatedAt: new Date().toISOString(),
    };
    writeWorkspaceSessions(workspaceId, sessions);
    return true;
  },
  updateMessage: async (
    _e,
    workspaceId: string,
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<boolean> => {
    const sessions = readWorkspaceSessions(workspaceId);
    const s = sessions[sessionId];
    if (!s) return false;
    const msgIndex = s.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return false;
    const updatedMessages = [...s.messages];
    updatedMessages[msgIndex] = { ...updatedMessages[msgIndex], content };
    // Remove all messages after the edited one (for re-generation)
    const trimmedMessages = updatedMessages.slice(0, msgIndex + 1);
    sessions[sessionId] = {
      ...s,
      messages: trimmedMessages,
      updatedAt: new Date().toISOString(),
    };
    writeWorkspaceSessions(workspaceId, sessions);
    return true;
  },
} satisfies NamespaceHandlers;
