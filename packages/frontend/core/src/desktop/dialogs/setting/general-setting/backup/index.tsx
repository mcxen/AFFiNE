import {
  Button,
  IconButton,
  Loading,
  Menu,
  MenuItem,
  Modal,
  notify,
  Skeleton,
  useConfirmModal,
} from '@affine/component';
import {
  Pagination,
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { BackupService } from '@affine/core/modules/backup/services';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { GlobalStateService } from '@affine/core/modules/storage';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { toArrayBuffer } from '@affine/core/utils/array-buffer';
import { i18nTime, useI18n } from '@affine/i18n';
import track from '@affine/track';
import {
  DeleteIcon,
  LocalWorkspaceIcon,
  MoreVerticalIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import bytes from 'bytes';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './styles.css';

const Empty = () => {
  const t = useI18n();
  return (
    <div className={styles.empty}>
      {t['com.affine.settings.workspace.backup.empty']()}
    </div>
  );
};

const BlobAvatar = ({
  blob,
  name,
}: {
  blob: Uint8Array | null;
  name: string;
}) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(new Blob([toArrayBuffer(blob)]));
    setUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <Avatar colorfulFallback name={name} rounded={4} size={32} url={url} />
  );
};

type BackupWorkspaceItem = {
  id: string;
  name: string;
  fileSize: number;
  updatedAt: Date;
  avatar: Uint8Array | null;
  dbPath: string;
};

const BackupWorkspaceItem = ({ item }: { item: BackupWorkspaceItem }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const { openConfirmModal } = useConfirmModal();
  const backupService = useService(BackupService);
  const t = useI18n();
  const [importing, setImporting] = useState(false);

  const { jumpToPage } = useNavigateHelper();

  const handleImport = useAsyncCallback(async () => {
    setImporting(true);
    track.$.settingsPanel.archivedWorkspaces.recoverArchivedWorkspace();
    const workspaceId = await backupService.recoverBackupWorkspace(item.id);
    if (!workspaceId) {
      setImporting(false);
      return;
    }
    notify.success({
      title: t['com.affine.settings.workspace.backup.import.success'](),
      actions: [
        {
          key: 'open',
          label:
            t['com.affine.settings.workspace.backup.import.success.action'](),
          onClick: () => {
            jumpToPage(workspaceId, 'all');
          },
          autoClose: false,
        },
      ],
    });
    setMenuOpen(false);
    setImporting(false);
  }, [backupService, item.id, jumpToPage, t]);

  const handleDelete = useCallback(
    (backupWorkspaceId: string) => {
      openConfirmModal({
        title: t['com.affine.workspaceDelete.title'](),
        children: t['com.affine.settings.workspace.backup.delete.warning'](),
        onConfirm: async () => {
          track.$.settingsPanel.archivedWorkspaces.deleteArchivedWorkspace();
          await backupService.deleteBackupWorkspace(backupWorkspaceId);
          notify.success({
            title: t['com.affine.settings.workspace.backup.delete.success'](),
          });
        },
        confirmText: t['Confirm'](),
        cancelText: t['Cancel'](),
        confirmButtonOptions: {
          variant: 'error',
        },
      });
    },
    [backupService, openConfirmModal, t]
  );

  return (
    <div
      data-testid="backup-workspace-item"
      className={styles.listItem}
      key={item.id}
      onClick={() => setMenuOpen(v => !v)}
    >
      <BlobAvatar blob={item.avatar} name={item.name} />
      <div className={styles.listItemLeftLabel}>
        <div className={styles.listItemLeftLabelTitle}>{item.name}</div>
        <div className={styles.listItemLeftLabelDesc}>
          {bytes(item.fileSize)}
        </div>
      </div>
      <div className={styles.listItemRightLabel}>
        {t['com.affine.settings.workspace.backup.delete-at']({
          date: i18nTime(item.updatedAt, {
            absolute: {
              accuracy: 'day',
            },
          }),
          time: i18nTime(item.updatedAt, {
            absolute: {
              accuracy: 'minute',
              noDate: true,
              noYear: true,
            },
          }),
        })}
        <Menu
          rootOptions={{
            open: menuOpen && !importing,
            onOpenChange: setMenuOpen,
            modal: true,
          }}
          items={
            <>
              <MenuItem
                prefixIcon={<LocalWorkspaceIcon />}
                onClick={handleImport}
              >
                {t['com.affine.settings.workspace.backup.import']()}
              </MenuItem>
              <MenuItem
                prefixIcon={<DeleteIcon />}
                onClick={() => handleDelete(item.id)}
                type="danger"
              >
                {t['Delete']()}
              </MenuItem>
            </>
          }
          contentOptions={{ align: 'end' }}
        >
          <IconButton disabled={importing} size="20">
            {importing ? <Loading /> : <MoreVerticalIcon />}
          </IconButton>
        </Menu>
      </div>
    </div>
  );
};

const PAGE_SIZE = 6;

// ─── Config Export/Import with password encryption ───────────────────────────

async function deriveKey(password: string, salt: Uint8Array) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptConfig(data: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(data)
  );
  const payload = {
    v: 1,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  };
  return JSON.stringify(payload);
}

async function decryptConfig(
  fileContent: string,
  password: string
): Promise<string> {
  const payload = JSON.parse(fileContent);
  if (payload.v !== 1) throw new Error('Unsupported config format version');
  const salt = Uint8Array.from(atob(payload.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

const ConfigExportImport = () => {
  const editorSettingService = useService(EditorSettingService);
  const globalState = useService(GlobalStateService).globalState;
  const workspace = useService(WorkspaceService).workspace;
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [importing, setImporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!password || password !== confirmPassword) {
      notify.error({ title: 'Passwords do not match' });
      return;
    }
    const settings = editorSettingService.editorSetting.settings$.value;
    const customModelId = globalState.get<string>('ai-custom-model-id') ?? '';

    // Export BYOK local keys (includes API keys — hence password protection)
    let byokLocalKeys: unknown[] = [];
    if (BUILD_CONFIG.isElectron) {
      const { apis } = await import('@affine/electron-api');
      const exporter = (apis?.byokStorage as any)?.exportWorkspaceKeys;
      if (typeof exporter === 'function') {
        byokLocalKeys = (await exporter(workspace.id)) ?? [];
      }
    }

    const configData = JSON.stringify({
      exportedAt: new Date().toISOString(),
      workspaceId: workspace.id,
      editorSettings: settings,
      aiCustomModelId: customModelId,
      byokLocalKeys,
    });
    const encrypted = await encryptConfig(configData, password);
    const blob = new Blob([encrypted], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affine-config-${new Date().toISOString().slice(0, 10)}.affine-config`;
    a.click();
    URL.revokeObjectURL(url);
    setExportModalOpen(false);
    setPassword('');
    setConfirmPassword('');
    notify.success({ title: 'Configuration exported successfully' });
  }, [
    password,
    confirmPassword,
    editorSettingService,
    globalState,
    workspace.id,
  ]);

  const handleImport = useCallback(async () => {
    if (!password) {
      notify.error({ title: 'Password is required' });
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.affine-config';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const content = await file.text();
        const decrypted = await decryptConfig(content, password);
        const config = JSON.parse(decrypted);
        if (config.editorSettings) {
          for (const [key, value] of Object.entries(config.editorSettings)) {
            editorSettingService.editorSetting.set(
              key as any,
              value as any
            );
          }
        }
        if (config.aiCustomModelId) {
          globalState.set('ai-custom-model-id', config.aiCustomModelId);
        }
        if (
          BUILD_CONFIG.isElectron &&
          Array.isArray(config.byokLocalKeys) &&
          config.byokLocalKeys.length
        ) {
          const { apis } = await import('@affine/electron-api');
          const upsert = apis?.byokStorage?.upsertWorkspaceKey;
          if (typeof upsert === 'function') {
            for (const key of config.byokLocalKeys) {
              await upsert(workspace.id, key).catch(() => {});
            }
          }
        }
        setImportModalOpen(false);
        setPassword('');
        notify.success({ title: 'Configuration imported successfully' });
      } catch {
        notify.error({
          title: 'Import failed',
          message: 'Wrong password or corrupted file.',
        });
      } finally {
        setImporting(false);
      }
    };
    input.click();
  }, [password, editorSettingService, globalState, workspace.id]);

  return (
    <>
      <SettingWrapper title="Configuration">
        <SettingRow
          name="Export configuration"
          desc="Export AI, font, and editor settings to an encrypted file."
        >
          <Button variant="primary" onClick={() => setExportModalOpen(true)}>
            Export
          </Button>
        </SettingRow>
        <SettingRow
          name="Import configuration"
          desc="Import settings from an encrypted config file."
        >
          <Button onClick={() => setImportModalOpen(true)}>Import</Button>
        </SettingRow>
      </SettingWrapper>

      <Modal
        width={400}
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        title="Export Configuration"
        description="Set a password to encrypt your configuration file. You will need this password to import it later."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ height: 32, borderRadius: 8, border: '1px solid #e6e6e6', padding: '0 10px', fontSize: 14 }}
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            style={{ height: 32, borderRadius: 8, border: '1px solid #e6e6e6', padding: '0 10px', fontSize: 14 }}
          />
          <Button
            variant="primary"
            disabled={!password || password !== confirmPassword}
            onClick={() => {
              handleExport().catch(() =>
                notify.error({ title: 'Export failed' })
              );
            }}
            style={{ alignSelf: 'flex-end' }}
          >
            Export
          </Button>
        </div>
      </Modal>

      <Modal
        width={400}
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        title="Import Configuration"
        description="Enter the password used when exporting the configuration file."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ height: 32, borderRadius: 8, border: '1px solid #e6e6e6', padding: '0 10px', fontSize: 14 }}
          />
          <Button
            variant="primary"
            disabled={!password || importing}
            onClick={() => {
              handleImport().catch(() =>
                notify.error({ title: 'Import failed' })
              );
            }}
            style={{ alignSelf: 'flex-end' }}
          >
            {importing ? 'Importing...' : 'Select file & Import'}
          </Button>
        </div>
      </Modal>
    </>
  );
};

export const BackupSettingPanel = () => {
  const t = useI18n();
  const backupService = useService(BackupService);

  useEffect(() => {
    backupService.revalidate();
  }, [backupService]);

  const isLoading = useLiveData(backupService.isLoading$);
  const backupWorkspaces = useLiveData(backupService.pageBackupWorkspaces$);

  const [pageNum, setPageNum] = useState(0);

  const innerElement = useMemo(() => {
    if (isLoading) {
      return (
        <Skeleton
          style={{ margin: '2px', width: 'calc(100% - 4px)' }}
          height={60}
          animation="wave"
        />
      );
    }
    if (!backupWorkspaces) {
      return null;
    }
    return (
      <>
        <div className={styles.list}>
          {backupWorkspaces.items
            .slice(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE)
            .map(item => (
              <BackupWorkspaceItem key={item.id} item={item} />
            ))}
        </div>
        {backupWorkspaces.items.length > PAGE_SIZE && (
          <div className={styles.pagination}>
            <Pagination
              totalCount={backupWorkspaces?.items.length ?? 0}
              countPerPage={PAGE_SIZE}
              pageNum={pageNum}
              onPageChange={(_, pageNum) => {
                setPageNum(pageNum);
              }}
            />
          </div>
        )}
      </>
    );
  }, [isLoading, backupWorkspaces, pageNum]);

  const isEmpty =
    (backupWorkspaces?.items.length === 0 || !backupWorkspaces) && !isLoading;

  return (
    <>
      <SettingHeader
        title={t['com.affine.settings.workspace.backup']()}
        subtitle={t['com.affine.settings.workspace.backup.subtitle']()}
        data-testid="backup-title"
      />
      <ConfigExportImport />
      {isEmpty ? (
        <Empty />
      ) : (
        <div className={styles.listContainer}>{innerElement}</div>
      )}
    </>
  );
};
