import { Button, notify } from '@affine/component';
import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import {
  AI_CUSTOM_MODEL_ID_KEY,
  AIModelService,
} from '@affine/core/modules/ai-button/services/models';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { GlobalStateService } from '@affine/core/modules/storage';
import { WorkspaceService } from '@affine/core/modules/workspace';
import {
  ByokKeyStorage,
  ByokProvider,
  clearWorkspaceByokConfigsMutation as clearByokMutation,
  deleteWorkspaceByokConfigMutation as deleteByokMutation,
  type GraphQLQuery,
  workspaceByokSettingsQuery as byokSettingsQuery,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AIProvider } from '../../../../../blocksuite/ai/provider';
import { AddKeyModal } from './add-key-modal';
import { CoveragePanel } from './coverage';
import { logByokError } from './errors';
import * as styles from './index.css';
import { KeyList } from './key-list';
import {
  clearLocalKeys,
  deleteLocalKey,
  fetchLocalModels,
  localByokStorageSupported,
  readLocalKeys,
  reorderLocalKeys,
  testLocalChatModel,
} from './local-storage';
import { byokT } from './metadata';
import type {
  ByokKey,
  ByokSettings,
  ByokStorage,
  ByokUsagePoint,
  GqlFn,
} from './types';
import { UsagePanel } from './usage';

const LOCAL_BYOK_SETTINGS = {
  workspaceId: '',
  entitled: true,
  serverEntitled: false,
  localEntitled: true,
  entitlementRequired: [],
  keys: [],
  allowedProviders: Object.values(ByokProvider),
  localStorageSupported: true,
  customEndpointSupported: true,
  hasAiPlan: false,
  warnings: [],
} satisfies ByokSettings;

const reorderByokMutation = {
  id: 'reorderWorkspaceByokConfigsMutation',
  op: 'reorderWorkspaceByokConfigs',
  query: `mutation reorderWorkspaceByokConfigs($input: ReorderWorkspaceByokConfigsInput!) {
    reorderWorkspaceByokConfigs(input: $input) {
      id
      sortOrder
    }
  }`,
} satisfies GraphQLQuery;

export const WorkspaceByokSetting = () => {
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;
  const workspaceServer = useService(WorkspaceServerService);
  const globalState = useService(GlobalStateService).globalState;
  const aiModelService = useService(AIModelService);
  const [settings, setSettings] = useState<ByokSettings | null>(null);
  const [usage, setUsage] = useState<ByokUsagePoint[]>([]);
  const [localKeys, setLocalKeys] = useState<ByokKey[]>([]);
  const [customModelId, setCustomModelId] = useState('');
  const [checkingModel, setCheckingModel] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ByokKey | null>(null);
  const [draggingKey, setDraggingKey] = useState<{
    id: string;
    storage: ByokStorage;
  } | null>(null);
  const [availableModels, setAvailableModels] = useState<
    { id: string; name?: string }[]
  >([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const load = useCallback(async () => {
    const [localStorageSupported, nextLocalKeys] = await Promise.all([
      localByokStorageSupported(),
      readLocalKeys(workspace.id),
    ]);
    setLocalKeys(nextLocalKeys);

    const localOnlySettings = {
      ...LOCAL_BYOK_SETTINGS,
      workspaceId: workspace.id,
      localStorageSupported,
      entitled: true,
      localEntitled: true,
    };

    if (!workspaceServer.server) {
      setSettings(localOnlySettings);
      setUsage([]);
      return;
    }

    try {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      const gql = workspaceServer.server.gql as GqlFn;
      const data = await gql({
        query: byokSettingsQuery,
        variables: {
          id: workspace.id,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      });
      setSettings({
        ...data.workspace.byokSettings,
        localStorageSupported,
      });
      setUsage(data.workspace.byokUsage);
    } catch (error) {
      logByokError('Failed to load server BYOK settings, using local', error);
      setSettings(localOnlySettings);
      setUsage([]);
    }
  }, [workspace.id, workspaceServer.server]);

  useEffect(() => {
    load().catch(error => {
      logByokError('Failed to load BYOK settings', error);
      notify.error({
        title: byokT(t, 'notify.load-failed.title'),
        message: byokT(t, 'notify.operation-failed.message'),
      });
    });
  }, [load, t]);

  useEffect(() => {
    setCustomModelId(globalState.get<string>(AI_CUSTOM_MODEL_ID_KEY) ?? '');
  }, [globalState]);

  const keys = useMemo(() => {
    return [...localKeys, ...(settings?.keys ?? [])].toSorted((a, b) => {
      if (a.storage !== b.storage) {
        return a.storage === ByokKeyStorage.local ? -1 : 1;
      }
      return a.sortOrder - b.sortOrder;
    });
  }, [localKeys, settings?.keys]);
  const canAddServerKey = !!workspaceServer.server;
  const canAddLocalKey = settings?.localStorageSupported ?? false;
  const canManageKeys = canAddServerKey || canAddLocalKey;
  const checkModelConnectivity = useCallback(async () => {
    const normalized = customModelId.trim();
    if (!normalized) {
      notify.error({
        title: 'Model id is required',
        message: 'Enter a provider model id first.',
      });
      return;
    }
    if (!AIProvider.actions.chat) {
      notify.error({
        title: 'AI is unavailable',
        message: 'AI provider is not ready in current client context.',
      });
      return;
    }

    setCheckingModel(true);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 15000);
    try {
      if (localKeys.some(key => key.provider === ByokProvider.openai)) {
        const result = await testLocalChatModel(workspace.id, normalized);
        if (result && !result.skipped) {
          if (result.ok) {
            notify.success({
              title: 'Model connectivity check passed',
              message: `${normalized} responded through ${result.keyName}.`,
            });
          } else {
            notify.error({
              title: 'Model connectivity check failed',
              message: result.message,
            });
          }
          return;
        }
      }

      const stream = await AIProvider.actions.chat({
        input: 'ping',
        workspaceId: workspace.id,
        stream: true,
        signal: abortController.signal,
        modelId: normalized,
      });
      for await (const _chunk of stream) {
        notify.success({
          title: 'Model connectivity check passed',
          message: `${normalized} responded successfully.`,
        });
        return;
      }
      notify.error({
        title: 'Model connectivity check failed',
        message: 'No response received from model stream.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error({
        title: 'Model connectivity check failed',
        message,
      });
    } finally {
      clearTimeout(timeout);
      setCheckingModel(false);
    }
  }, [customModelId, localKeys, workspace.id]);

  const clearAll = useCallback(async () => {
    if (!settings) {
      return;
    }
    if (!workspaceServer.server) {
      return;
    }
    if (workspaceServer.server) {
      const gql = workspaceServer.server.gql as GqlFn;
      await gql({
        query: clearByokMutation,
        variables: { workspaceId: workspace.id },
      });
    }
    if (settings.localStorageSupported) {
      await clearLocalKeys(workspace.id);
    }
    setLocalKeys([]);
    await load();
  }, [load, settings, workspace.id, workspaceServer.server]);

  const deleteKey = useCallback(
    async (key: ByokKey) => {
      if (key.storage === ByokKeyStorage.local) {
        await deleteLocalKey(workspace.id, key.id);
        setLocalKeys(await readLocalKeys(workspace.id));
        return;
      }
      const gql = workspaceServer.server?.gql as
        | ((input: {
            query: GraphQLQuery;
            variables?: Record<string, unknown>;
          }) => Promise<unknown>)
        | undefined;
      await gql?.({
        query: deleteByokMutation,
        variables: { workspaceId: workspace.id, id: key.id },
      });
      await load();
    },
    [load, workspace.id, workspaceServer.server]
  );

  const reorderKey = useCallback(
    async (targetKey: ByokKey) => {
      if (!draggingKey || draggingKey.id === targetKey.id) {
        return;
      }
      if (draggingKey.storage !== targetKey.storage) {
        notify.error({
          title: byokT(t, 'notify.cross-storage-reorder.title'),
          message: byokT(t, 'notify.cross-storage-reorder.message'),
        });
        return;
      }

      const bucket = keys.filter(key => key.storage === targetKey.storage);
      const fromIndex = bucket.findIndex(key => key.id === draggingKey.id);
      const toIndex = bucket.findIndex(key => key.id === targetKey.id);
      if (fromIndex === -1 || toIndex === -1) {
        return;
      }

      const nextBucket = [...bucket];
      const [moved] = nextBucket.splice(fromIndex, 1);
      nextBucket.splice(toIndex, 0, moved);
      const nextBucketIds = nextBucket.map(key => key.id);

      if (targetKey.storage === ByokKeyStorage.local) {
        setLocalKeys(await reorderLocalKeys(workspace.id, nextBucketIds));
        return;
      }

      const gql = workspaceServer.server?.gql as
        | ((input: {
            query: GraphQLQuery;
            variables?: Record<string, unknown>;
          }) => Promise<unknown>)
        | undefined;
      await gql?.({
        query: reorderByokMutation,
        variables: {
          input: {
            workspaceId: workspace.id,
            storage: ByokKeyStorage.server,
            ids: nextBucketIds,
          },
        },
      });
      await load();
    },
    [draggingKey, keys, load, t, workspace.id, workspaceServer.server]
  );

  if (!settings) {
    return <SettingHeader title="AI" subtitle={byokT(t, 'loading')} />;
  }

  return (
    <>
      <SettingHeader title="AI" subtitle={byokT(t, 'header')} />
      <SettingWrapper>
        <div className={styles.stack}>
          <div className={styles.panel} data-testid="workspace-byok-keys">
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.title}>{byokT(t, 'keys.title')}</div>
                <div className={styles.description}>
                  {byokT(t, 'keys.description')}
                </div>
              </div>
              <Button
                variant="primary"
                disabled={!canManageKeys}
                onClick={() => {
                  setEditingKey(null);
                  setModalOpen(true);
                }}
              >
                {byokT(t, 'action.add-key')}
              </Button>
            </div>
            {keys.length ? (
              <KeyList
                keys={keys}
                onEdit={key => {
                  setEditingKey(key);
                  setModalOpen(true);
                }}
                onDelete={key => {
                  deleteKey(key).catch(error => {
                    logByokError('Failed to delete BYOK key', error);
                    notify.error({
                      title: byokT(t, 'notify.delete-failed.title'),
                      message: byokT(t, 'notify.operation-failed.message'),
                    });
                  });
                }}
                onDragStart={key => {
                  setDraggingKey({ id: key.id, storage: key.storage });
                }}
                onDragEnd={() => setDraggingKey(null)}
                onDrop={key => {
                  reorderKey(key).catch(error => {
                    logByokError('Failed to reorder BYOK keys', error);
                    notify.error({
                      title: byokT(t, 'notify.reorder-failed.title'),
                      message: byokT(t, 'notify.operation-failed.message'),
                    });
                  });
                }}
              />
            ) : (
              <div className={styles.empty} data-testid="workspace-byok-empty">
                <div className={styles.title}>{byokT(t, 'empty.title')}</div>
                <div className={styles.description}>
                  {byokT(t, 'empty.description')}
                </div>
              </div>
            )}
          </div>

          <div className={styles.panel} data-testid="workspace-byok-model">
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.title}>Custom model</div>
                <div className={styles.description}>
                  Use a custom chat model id with your BYOK provider. You can
                  fetch available models from your endpoint or enter a model id
                  manually.
                </div>
              </div>
              <Button
                disabled={fetchingModels || !localKeys.length}
                onClick={() => {
                  setFetchingModels(true);
                  fetchLocalModels(workspace.id)
                    .then(models => {
                      setAvailableModels(models);
                      if (!models.length) {
                        notify.error({
                          title: 'No models found',
                          message:
                            'Could not fetch models from the endpoint. Check your API key and endpoint.',
                        });
                      } else {
                        notify.success({
                          title: `${models.length} models loaded`,
                        });
                      }
                    })
                    .catch(error => {
                      logByokError('Failed to fetch models', error);
                      notify.error({
                        title: 'Failed to fetch models',
                        message:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      });
                    })
                    .finally(() => setFetchingModels(false));
                }}
              >
                {fetchingModels ? 'Fetching...' : 'Fetch Models'}
              </Button>
            </div>
            <div className={styles.modelForm}>
              {availableModels.length > 0 ? (
                <select
                  className={styles.input}
                  value={customModelId}
                  onChange={event => setCustomModelId(event.target.value)}
                >
                  <option value="">Select a model...</option>
                  {availableModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name || model.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.input}
                  value={customModelId}
                  onChange={event => setCustomModelId(event.target.value)}
                  placeholder="Provider model id (e.g. gpt-4o, claude-3-5-sonnet)"
                />
              )}
              <Button
                onClick={() => {
                  checkModelConnectivity().catch(error => {
                    logByokError(
                      'Failed to check BYOK model connectivity',
                      error
                    );
                  });
                }}
                disabled={checkingModel}
              >
                {checkingModel ? 'Checking...' : 'Check'}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const normalized = customModelId.trim();
                  aiModelService.setCustomModel(normalized);
                  notify.success({
                    title: normalized
                      ? 'Custom AI model saved'
                      : 'Custom AI model cleared',
                  });
                }}
              >
                Save
              </Button>
            </div>
          </div>

          {workspaceServer.server ? (
            <CoveragePanel keys={keys} settings={settings} />
          ) : null}

          {workspaceServer.server ? (
            <UsagePanel
              keys={keys}
              usage={usage}
              onClearAll={() => {
                clearAll().catch(error => {
                  logByokError('Failed to clear BYOK keys', error);
                  notify.error({
                    title: byokT(t, 'notify.clear-failed.title'),
                    message: byokT(t, 'notify.operation-failed.message'),
                  });
                });
              }}
            />
          ) : null}
        </div>
      </SettingWrapper>
      <AddKeyModal
        workspaceId={workspace.id}
        settings={settings}
        editingKey={editingKey}
        open={modalOpen}
        onOpenChange={open => {
          setModalOpen(open);
          if (!open) {
            setEditingKey(null);
          }
        }}
        onSaved={load}
        localKeys={localKeys}
        setLocalKeys={setLocalKeys}
        localStorageSupported={settings.localStorageSupported}
        canAddServerKey={canAddServerKey}
        canAddLocalKey={canAddLocalKey}
        gql={workspaceServer.server?.gql as GqlFn | undefined}
      />
    </>
  );
};
