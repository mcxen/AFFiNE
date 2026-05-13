import { Button, Modal, notify } from '@affine/component';
import {
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { GlobalStateService } from '@affine/core/modules/storage';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

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
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
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

export const ConfigExportImport = () => {
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
    a.download = `affine-config-${new Date()
      .toISOString()
      .slice(0, 10)}.affine-config`;
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
            editorSettingService.editorSetting.set(key as any, value as any);
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
            style={{
              height: 32,
              borderRadius: 8,
              border: '1px solid #e6e6e6',
              padding: '0 10px',
              fontSize: 14,
            }}
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            style={{
              height: 32,
              borderRadius: 8,
              border: '1px solid #e6e6e6',
              padding: '0 10px',
              fontSize: 14,
            }}
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
            style={{
              height: 32,
              borderRadius: 8,
              border: '1px solid #e6e6e6',
              padding: '0 10px',
              fontSize: 14,
            }}
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
