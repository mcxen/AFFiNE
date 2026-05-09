import {
  Button,
  ErrorMessage,
  notify,
  Skeleton,
  Switch,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AccessTokenService, ServerService } from '@affine/core/modules/cloud';
import type { AccessToken } from '@affine/core/modules/cloud/stores/access-token';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { apis } from '@affine/electron-api';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { IntegrationSettingHeader } from '../setting';
import MCPIcon from './MCP.inline.svg';
import * as styles from './setting-panel.css';

export const McpServerSettingPanel = () => {
  return <McpServerSetting />;
};

const McpServerSettingHeader = ({ action }: { action?: ReactNode }) => {
  const t = useI18n();

  return (
    <IntegrationSettingHeader
      icon={<img src={MCPIcon} />}
      name={t['com.affine.integration.mcp-server.name']()}
      desc={t['com.affine.integration.mcp-server.desc']()}
      action={action}
    />
  );
};

const McpServerSetting = () => {
  const workspaceService = useService(WorkspaceService);
  const serverService = useService(ServerService);
  const workspaceName = useLiveData(workspaceService.workspace.name$);
  const accessTokenService = useService(AccessTokenService);
  const accessTokens = useLiveData(accessTokenService.accessTokens$);
  const isRevalidating = useLiveData(accessTokenService.isRevalidating$);
  const error = useLiveData(accessTokenService.error$);
  const [mutating, setMutating] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<{
    enabled: boolean;
    running: boolean;
    url: string;
  } | null>(null);
  const [mcpToggling, setMcpToggling] = useState(false);
  const [revealedAccessToken, setRevealedAccessToken] =
    useState<AccessToken | null>(null);
  const t = useI18n();
  const isDesktopLocalMcp = BUILD_CONFIG.isElectron;

  const mcpAccessToken = useMemo(() => {
    return accessTokens?.find(token => token.name === 'mcp');
  }, [accessTokens]);

  const displayedToken = revealedAccessToken ?? mcpAccessToken;
  const hasMcpToken = Boolean(revealedAccessToken || mcpAccessToken);
  const hasCopyableToken = Boolean(revealedAccessToken);
  const isRedactedDisplay = hasMcpToken && !hasCopyableToken;

  const code = useMemo(() => {
    if (isDesktopLocalMcp) {
      const url = mcpStatus?.url ?? 'http://127.0.0.1:30115/mcp';
      return JSON.stringify(
        {
          mcpServers: {
            affine_desktop: {
              type: 'streamable-http',
              url,
              note: `Read and edit local AFFiNE docs from workspace "${workspaceName}"`,
            },
          },
        },
        null,
        2
      );
    }

    return displayedToken
      ? JSON.stringify(
          {
            mcpServers: {
              [`affine_workspace_${workspaceService.workspace.id}`]: {
                type: 'streamable-http',
                url: `${serverService.server.baseUrl}/api/workspaces/${workspaceService.workspace.id}/mcp`,
                note: `Read and edit docs from AFFiNE workspace "${workspaceName}"`,
                headers: {
                  Authorization: `Bearer ${displayedToken.token}`,
                },
              },
            },
          },
          null,
          2
        )
      : null;
  }, [
    displayedToken,
    isDesktopLocalMcp,
    mcpStatus?.url,
    workspaceName,
    workspaceService,
    serverService,
  ]);

  const copyJsonDisabled =
    !code ||
    mutating ||
    (isDesktopLocalMcp && !mcpStatus?.enabled) ||
    (!isDesktopLocalMcp && isRedactedDisplay);
  const copyJsonTooltip =
    !isDesktopLocalMcp && isRedactedDisplay
      ? t['com.affine.integration.mcp-server.copy-json.disabled-hint']()
      : undefined;

  const showLoading =
    !isDesktopLocalMcp && accessTokens === null && isRevalidating;
  const showError =
    !isDesktopLocalMcp && accessTokens === null && error !== null;

  useEffect(() => {
    if (!isDesktopLocalMcp) {
      accessTokenService.revalidate();
    }
  }, [accessTokenService, isDesktopLocalMcp]);

  useEffect(() => {
    if (!isDesktopLocalMcp) {
      return;
    }
    apis?.mcp
      .getStatus()
      .then(setMcpStatus)
      .catch(err => {
        notify.error({
          error: UserFriendlyError.fromAny(err),
        });
      });
  }, [isDesktopLocalMcp]);

  const handleToggleLocalMcp = useAsyncCallback(async (enabled: boolean) => {
    setMcpToggling(true);
    try {
      const status = await apis?.mcp.setEnabled(enabled);
      if (status) {
        setMcpStatus(status);
      }
    } catch (err) {
      notify.error({
        error: UserFriendlyError.fromAny(err),
      });
    } finally {
      setMcpToggling(false);
    }
  }, []);

  const handleGenerateAccessToken = useAsyncCallback(async () => {
    setMutating(true);
    try {
      if (mcpAccessToken) {
        await accessTokenService.revokeUserAccessToken(mcpAccessToken.id);
      }
      const createdToken =
        await accessTokenService.generateUserAccessToken('mcp');
      setRevealedAccessToken(createdToken);
    } catch (err) {
      notify.error({
        error: UserFriendlyError.fromAny(err),
      });
    } finally {
      setMutating(false);
    }
  }, [accessTokenService, mcpAccessToken]);

  const handleRevokeAccessToken = useAsyncCallback(async () => {
    setMutating(true);
    try {
      if (mcpAccessToken) {
        await accessTokenService.revokeUserAccessToken(mcpAccessToken.id);
      }
      setRevealedAccessToken(null);
    } catch (err) {
      notify.error({
        error: UserFriendlyError.fromAny(err),
      });
    } finally {
      setMutating(false);
    }
  }, [accessTokenService, mcpAccessToken]);

  if (showLoading) {
    return (
      <div>
        <McpServerSettingHeader />
        <Skeleton />
      </div>
    );
  }

  if (showError) {
    return (
      <div>
        <McpServerSettingHeader />
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    );
  }

  return (
    <div>
      <McpServerSettingHeader />

      {!isDesktopLocalMcp ? (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Personal access token</div>
            {!hasMcpToken ? (
              <Button
                variant="primary"
                onClick={handleGenerateAccessToken}
                disabled={mutating}
              >
                Create New
              </Button>
            ) : (
              <Button
                variant="error"
                onClick={handleRevokeAccessToken}
                disabled={mutating}
              >
                Delete
              </Button>
            )}
          </div>
          <p className={styles.sectionDescription}>
            This access token is used for the MCP service, please keep this
            information secure. Deleting it will invalidate the access token.
          </p>
        </div>
      ) : null}

      {isDesktopLocalMcp ? (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Local MCP Server</div>
            <Switch
              checked={Boolean(mcpStatus?.enabled)}
              disabled={!mcpStatus || mcpToggling}
              onChange={handleToggleLocalMcp}
            />
          </div>
          <p className={styles.sectionDescription}>
            {mcpStatus?.running
              ? `Running at ${mcpStatus.url}`
              : 'Stopped. Turn this on before connecting an MCP client.'}
          </p>
        </div>
      ) : null}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Server Config</div>
          <Button
            variant="primary"
            onClick={() => {
              if (!code) return;
              // oxlint-disable-next-line @typescript-eslint/no-floating-promises
              navigator.clipboard.writeText(code);
              notify.success({
                title: t['Copied to clipboard'](),
              });
            }}
            disabled={copyJsonDisabled}
            tooltip={copyJsonTooltip}
          >
            Copy json
          </Button>
        </div>
        {code ? (
          <pre className={styles.preArea}>{code}</pre>
        ) : (
          <p
            className={styles.sectionDescription}
            style={{ textAlign: 'center' }}
          >
            No MCP server config available.
          </p>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Support tools</div>
        </div>
        <br />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>read_document</div>
          </div>
          <div className={styles.sectionDescription}>
            Read a document identified by docId and return its markdown content.
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>list_documents</div>
          </div>
          <div className={styles.sectionDescription}>
            List documents in a local or cloud workspace.
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>keyword_search</div>
          </div>
          <div className={styles.sectionDescription}>
            Fuzzy search all workspace documents for the exact keyword or phrase
            supplied and return passages ranked by textual match. Use this tool
            by default whenever a straightforward term-based or keyword-base
            lookup is sufficient.
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>create_document</div>
          </div>
          <div className={styles.sectionDescription}>
            Create a new document in the workspace from a title and markdown
            body.
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>update_document</div>
          </div>
          <div className={styles.sectionDescription}>
            Replace an existing document body with markdown content while
            preserving document history.
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>update_document_meta</div>
          </div>
          <div className={styles.sectionDescription}>
            Update document metadata, including the document title.
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>delete_document</div>
          </div>
          <div className={styles.sectionDescription}>
            Delete an existing document from the workspace.
          </div>
        </div>
      </div>
    </div>
  );
};
