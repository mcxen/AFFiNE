import type { ChatContextValue } from '@affine/core/blocksuite/ai/components/ai-chat-content';
import {
  type AIChatParams,
  AIProvider,
  type AISendParams,
} from '@affine/core/blocksuite/ai/provider';
import { extractSelectedContent } from '@affine/core/blocksuite/ai/utils/extract';
import { AIModelService } from '@affine/core/modules/ai-button/services/models';
import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { apis } from '@affine/electron-api';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as styles from './index.css';

type LocalChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type LocalChatContext = Pick<
  Partial<ChatContextValue>,
  'quote' | 'markdown' | 'combinedElementsMarkdown'
>;

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
  return BUILD_CONFIG.isElectron ? apis?.byokStorage : undefined;
}

export const Component = () => {
  const t = useI18n();
  const workspaceId = useService(WorkspaceService).workspace.id;
  const aiModelService = useService(AIModelService);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [context, setContext] = useState<LocalChatContext | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
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

      const userMessage: LocalChatMessage = {
        id: createMessageId(),
        role: 'user',
        content,
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

      try {
        const answer = await storage.chatCompletions(workspaceId, {
          modelId,
          content: buildPrompt(messages, content),
          contexts: selectedMarkdown
            ? {
                selectedMarkdown,
              }
            : undefined,
        });
        setMessages(current =>
          current.map(message =>
            message.id === assistantMessage.id
              ? { ...message, content: answer || '(empty response)' }
              : message
          )
        );
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
        inputRef.current?.focus();
      }
    },
    [context, isSending, messages, modelId, workspaceId]
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
        </div>
      </ViewHeader>
      <ViewBody>
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
                  <div className={styles.messageContent}>
                    {message.content || (isSending ? 'Thinking...' : '')}
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
      </ViewBody>
    </>
  );
};
