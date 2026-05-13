import type { ChatContextValue } from '@affine/core/blocksuite/ai/components/ai-chat-content';
import {
  type AIChatParams,
  AIProvider,
  type AISendParams,
} from '@affine/core/blocksuite/ai/provider';
import {
  extractMarkdownFromDoc,
  extractSelectedContent,
} from '@affine/core/blocksuite/ai/utils/extract';
import { useAIChatConfig } from '@affine/core/components/hooks/affine/use-ai-chat-config';
import { AIModelService } from '@affine/core/modules/ai-button/services/models';
import { DocsService } from '@affine/core/modules/doc';
import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { apis } from '@affine/electron-api';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './index.css';

type LocalChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  docs?: { docId: string; title: string }[];
};

type LocalChatContext = Pick<
  Partial<ChatContextValue>,
  'quote' | 'markdown' | 'combinedElementsMarkdown'
>;

type SelectedDocContext = {
  docId: string;
  title: string;
  markdown: string;
};

function createMessageId() {
  return crypto.randomUUID();
}

function getContextMarkdown(context: LocalChatContext | null) {
  return (
    context?.combinedElementsMarkdown?.trim() ||
    context?.markdown?.trim() ||
    context?.quote?.trim() ||
    ''
  );
}

function buildPrompt(messages: LocalChatMessage[], input: string) {
  const history = messages
    .slice(-12)
    .map(message => {
      const role = message.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${message.content}`;
    })
    .join('\n\n');

  return history ? `${history}\n\nUser: ${input}` : input;
}

function localByokStorage() {
  return BUILD_CONFIG.isElectron || BUILD_CONFIG.isMobileEdition
    ? apis?.byokStorage
    : undefined;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(
        link ? (
          <a key={match.index} href={link[2]} rel="noreferrer" target="_blank">
            {link[1]}
          </a>
        ) : (
          token
        )
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function MarkdownContent({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div className={styles.markdownContent}>
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('```')) {
          return (
            <pre key={index}>
              <code>
                {trimmed.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}
              </code>
            </pre>
          );
        }

        if (/^#{1,6}\s/.test(trimmed)) {
          return (
            <div key={index} className={styles.markdownHeading}>
              {renderInlineMarkdown(trimmed.replace(/^#{1,6}\s/, ''))}
            </div>
          );
        }

        const lines = trimmed.split('\n');
        const listItems = lines
          .map(line => line.match(/^\s*[-*]\s+(.+)$/)?.[1])
          .filter((item): item is string => !!item);
        if (listItems.length && listItems.length === lines.length) {
          return (
            <ul key={index}>
              {listItems.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        return <p key={index}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

export const Component = () => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const workspaceId = workspaceService.workspace.id;
  const docsService = useService(DocsService);
  const aiModelService = useService(AIModelService);
  const { docDisplayConfig } = useAIChatConfig();
  const docIds = useLiveData(docsService.list.nonTrashDocsIds$);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [context, setContext] = useState<LocalChatContext | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<SelectedDocContext[]>([]);
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<
    { sessionId: string; title: string | null; updatedAt: string }[]
  >([]);
  const [showHistory, setShowHistory] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const modelId = aiModelService.getModelId()?.trim();
  const canSend = !!input.trim() && !isSending;
  const contextMarkdown = getContextMarkdown(context);

  useEffect(() => {
    let cancelled = false;
    const storage = localByokStorage();

    if (!storage) {
      setHasProvider(false);
      return;
    }

    storage
      .hasWorkspaceChatProvider(workspaceId)
      .then(result => {
        if (!cancelled) {
          setHasProvider(result);
        }
      })
      .catch(error => {
        console.warn('Failed to check local AI provider', error);
        if (!cancelled) {
          setHasProvider(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Load session list
  const loadSessions = useCallback(async () => {
    const chatHistory = (apis as any)?.chatHistory;
    if (!chatHistory?.listSessions) return;
    try {
      const list = await chatHistory.listSessions(workspaceId, {});
      setSessions(
        (list || []).map((s: any) => ({
          sessionId: s.sessionId,
          title: s.title,
          updatedAt: s.updatedAt,
        }))
      );
    } catch {
      // ignore
    }
  }, [workspaceId]);

  useEffect(() => {
    loadSessions().catch(() => {});
  }, [loadSessions]);

  // Load a session's messages
  const openSession = useCallback(
    async (sid: string) => {
      const chatHistory = (apis as any)?.chatHistory;
      if (!chatHistory?.getSession) return;
      try {
        const session = await chatHistory.getSession(workspaceId, sid);
        if (session?.messages) {
          setMessages(
            session.messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            }))
          );
          setSessionId(sid);
        }
      } catch {
        // ignore
      }
    },
    [workspaceId]
  );

  // New chat
  const newChat = useCallback(() => {
    const newId = `local-${crypto.randomUUID()}`;
    setSessionId(newId);
    setMessages([]);
    setContext(null);
    setError(null);
    inputRef.current?.focus();
  }, []);

  // Delete a session
  const deleteSessionById = useCallback(
    async (sid: string) => {
      const chatHistory = (apis as any)?.chatHistory;
      if (!chatHistory?.deleteSessions) return;
      await chatHistory.deleteSessions(workspaceId, [sid]).catch(() => {});
      setSessions(prev => prev.filter(s => s.sessionId !== sid));
      if (sessionId === sid) {
        newChat();
      }
    },
    [workspaceId, sessionId, newChat]
  );

  // Initialize with a new session ID if none
  useEffect(() => {
    if (!sessionId) {
      setSessionId(`local-${crypto.randomUUID()}`);
    }
  }, [sessionId]);

  const statusText = useMemo(() => {
    if (hasProvider === null) {
      return 'Checking local AI provider...';
    }
    if (!hasProvider) {
      return 'Add a local OpenAI-compatible key in Settings > AI.';
    }
    if (!modelId) {
      return 'Set a custom model id in Settings > AI.';
    }
    return `Local BYOK: ${modelId}`;
  }, [hasProvider, modelId]);

  const docOptions = useMemo(
    () =>
      docIds
        .filter(docId => !selectedDocs.some(doc => doc.docId === docId))
        .map(docId => ({
          docId,
          title: docDisplayConfig.getTitle(docId),
        })),
    [docDisplayConfig, docIds, selectedDocs]
  );

  const addDocumentContext = useCallback(
    async (docId: string) => {
      if (!docId) return;
      setIsAddingDoc(true);
      setError(null);
      try {
        const doc = workspaceService.workspace.docCollection.getDoc(docId);
        const store = doc?.getStore();
        if (!store) {
          throw new Error('Document not found.');
        }
        if (!store.ready) {
          store.load();
        }
        const markdown = await extractMarkdownFromDoc(store);
        setSelectedDocs(current => [
          ...current,
          {
            docId,
            title: docDisplayConfig.getTitle(docId),
            markdown,
          },
        ]);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to add document context.'
        );
      } finally {
        setIsAddingDoc(false);
      }
    },
    [docDisplayConfig, workspaceService]
  );

  const sendInput = useCallback(
    async (rawInput: string, nextContext = context) => {
      const content = rawInput.trim();
      if (!content || isSending) {
        return;
      }

      const storage = localByokStorage();
      if (!storage) {
        setError('Local AI is only available in the desktop app.');
        return;
      }
      if (!modelId) {
        setError('Set a custom model id in Settings > AI first.');
        return;
      }

      const chatHistory = (apis as any)?.chatHistory;
      const currentSessionId = sessionId || `local-${crypto.randomUUID()}`;
      if (!sessionId) setSessionId(currentSessionId);

      const userMessage: LocalChatMessage = {
        id: createMessageId(),
        role: 'user',
        content,
        docs: selectedDocs.length
          ? selectedDocs.map(d => ({ docId: d.docId, title: d.title }))
          : undefined,
      };
      const assistantMessage: LocalChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: '',
      };
      const nextMessages = [...messages, userMessage, assistantMessage];

      const selectedMarkdown = getContextMarkdown(nextContext);

      setInput('');
      setError(null);
      setIsSending(true);
      setMessages(nextMessages);

      // Persist user message
      if (chatHistory?.appendMessage) {
        await chatHistory
          .appendMessage(
            workspaceId,
            { sessionId: currentSessionId, model: modelId },
            { ...userMessage, createdAt: new Date().toISOString() }
          )
          .catch(() => {});
        // Auto-generate title on first message
        if (messages.length === 0 && chatHistory.updateSessionTitle) {
          const title =
            content.slice(0, 50) + (content.length > 50 ? '...' : '');
          await chatHistory
            .updateSessionTitle(workspaceId, currentSessionId, title)
            .catch(() => {});
        }
      }

      try {
        const answer = await storage.chatCompletions(workspaceId, {
          modelId,
          content: buildPrompt(messages, content),
          contexts:
            selectedMarkdown || selectedDocs.length
              ? {
                  selectedMarkdown,
                  docs: selectedDocs.map(doc => ({
                    docTitle: doc.title,
                    docContent: doc.markdown,
                  })),
                }
              : undefined,
        } as any);
        setMessages(current =>
          current.map(message =>
            message.id === assistantMessage.id
              ? { ...message, content: answer || '(empty response)' }
              : message
          )
        );
        // Persist assistant message
        if (chatHistory?.appendMessage) {
          await chatHistory
            .appendMessage(
              workspaceId,
              { sessionId: currentSessionId, model: modelId },
              {
                ...assistantMessage,
                content: answer || '(empty response)',
                createdAt: new Date().toISOString(),
              }
            )
            .catch(() => {});
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(message);
        setMessages(current =>
          current.map(item =>
            item.id === assistantMessage.id
              ? { ...item, content: `Local AI request failed: ${message}` }
              : item
          )
        );
      } finally {
        setIsSending(false);
        setContext(null);
        loadSessions().catch(() => {});
        inputRef.current?.focus();
      }
    },
    [
      context,
      isSending,
      messages,
      modelId,
      selectedDocs,
      workspaceId,
      sessionId,
      loadSessions,
    ]
  );

  const send = useCallback(async () => {
    await sendInput(input);
  }, [input, sendInput]);

  useEffect(() => {
    const resolveContextFromParams = async (
      params: AIChatParams | AISendParams | null
    ) => {
      if (!params) {
        return null;
      }
      if ('context' in params && params.context) {
        return params.context;
      }
      if ('autoSelect' in params && params.autoSelect && params.host) {
        return await extractSelectedContent(params.host);
      }
      return null;
    };

    const openSubscription = AIProvider.slots.requestOpenWithChat.subscribe(
      params => {
        if (!params) {
          return;
        }
        resolveContextFromParams(params)
          .then(nextContext => {
            if (nextContext) {
              setContext(nextContext);
            }
            if (params.input) {
              setInput(params.input);
            }
            inputRef.current?.focus();
          })
          .catch(error => {
            console.error(error);
            setError(
              error instanceof Error
                ? error.message
                : 'Failed to read selected content.'
            );
          })
          .finally(() => {
            AIProvider.slots.requestOpenWithChat.next(null);
          });
      }
    );

    const sendSubscription = AIProvider.slots.requestSendWithChat.subscribe(
      params => {
        if (!params) {
          return;
        }
        resolveContextFromParams(params)
          .then(nextContext => {
            if (nextContext) {
              setContext(nextContext);
            }
            return sendInput(params.input, nextContext);
          })
          .catch(error => {
            console.error(error);
            setError(
              error instanceof Error
                ? error.message
                : 'Failed to send selected content.'
            );
          })
          .finally(() => {
            AIProvider.slots.requestSendWithChat.next(null);
          });
      }
    );

    return () => {
      openSubscription.unsubscribe();
      sendSubscription.unsubscribe();
    };
  }, [sendInput]);

  return (
    <>
      <ViewTitle title={t['com.affine.workspaceSubPath.chat']()} />
      <ViewIcon icon="ai" />
      <ViewHeader>
        <div className={styles.localHeader}>
          <div className={styles.localTitle}>AFFiNE AI</div>
          <div className={styles.localStatus}>{statusText}</div>
          <div className={styles.headerActions}>
            <button
              className={styles.headerButton}
              type="button"
              onClick={newChat}
              title="New Chat"
            >
              +
            </button>
            <button
              className={styles.headerButton}
              type="button"
              onClick={() => setShowHistory(prev => !prev)}
              title="Chat History"
            >
              ☰
            </button>
          </div>
        </div>
      </ViewHeader>
      <ViewBody>
        <div className={styles.chatLayout}>
          {showHistory && (
            <div className={styles.historySidebar}>
              <div className={styles.historyHeader}>
                <span>History</span>
              </div>
              <div className={styles.historyList}>
                {sessions.length === 0 ? (
                  <div className={styles.historyEmpty}>No conversations yet</div>
                ) : (
                  sessions.map(s => (
                    <div
                      key={s.sessionId}
                      className={styles.historyItem}
                      data-active={s.sessionId === sessionId}
                      onClick={() => openSession(s.sessionId).catch(() => {})}
                    >
                      <span className={styles.historyItemTitle}>
                        {s.title || 'New chat'}
                      </span>
                      <button
                        className={styles.historyItemDelete}
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          deleteSessionById(s.sessionId).catch(() => {});
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          <div className={styles.localRoot}>
          <div className={styles.messages}>
            {messages.length ? (
              messages.map(message => (
                <div
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? styles.userMessage
                      : styles.assistantMessage
                  }
                >
                  <div className={styles.messageRole}>
                    {message.role === 'user' ? 'You' : 'AFFiNE AI'}
                  </div>
                  {message.role === 'user' && message.docs?.length ? (
                    <div className={styles.messageDocs}>
                      {message.docs.map(d => (
                        <span key={d.docId} className={styles.messageDocChip}>
                          📄 {d.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.messageContent}>
                    {message.content ? (
                      <MarkdownContent content={message.content} />
                    ) : isSending ? (
                      'Thinking...'
                    ) : (
                      ''
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>✦</div>
                <div className={styles.emptyTitle}>
                  What can I help you with?
                </div>
              </div>
            )}
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.inputPanel}>
            <div className={styles.docContextRow}>
              <select
                className={styles.docSelect}
                value=""
                disabled={isAddingDoc || !docOptions.length}
                onChange={event => {
                  addDocumentContext(event.target.value).catch(console.error);
                }}
              >
                <option value="">
                  {isAddingDoc ? 'Adding document...' : 'Add document context'}
                </option>
                {docOptions.map(doc => (
                  <option key={doc.docId} value={doc.docId}>
                    {doc.title}
                  </option>
                ))}
              </select>
              {selectedDocs.map(doc => (
                <button
                  key={doc.docId}
                  className={styles.docChip}
                  type="button"
                  onClick={() =>
                    setSelectedDocs(current =>
                      current.filter(item => item.docId !== doc.docId)
                    )
                  }
                >
                  {doc.title}
                  <span>×</span>
                </button>
              ))}
            </div>
            {contextMarkdown ? (
              <div className={styles.contextPill}>
                <span className={styles.contextLabel}>Selected context</span>
                <span className={styles.contextPreview}>{contextMarkdown}</span>
                <button
                  className={styles.clearContextButton}
                  type="button"
                  onClick={() => setContext(null)}
                >
                  ×
                </button>
              </div>
            ) : null}
            <textarea
              ref={inputRef}
              className={styles.input}
              value={input}
              placeholder="What are your thoughts?"
              rows={3}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send().catch(console.error);
                }
              }}
            />
            <button
              className={styles.sendButton}
              type="button"
              disabled={!canSend}
              onClick={() => {
                send().catch(console.error);
              }}
            >
              ↑
            </button>
          </div>
          <div className={styles.disclaimer}>
            AI outputs can be misleading or wrong
          </div>
        </div>
        </div>
      </ViewBody>
    </>
  );
};
