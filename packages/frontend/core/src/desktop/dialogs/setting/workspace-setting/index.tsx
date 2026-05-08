import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { EmbeddingSettings } from '@affine/core/modules/workspace-indexer-embedding';
import { useI18n } from '@affine/i18n';
import {
  AiEmbeddingIcon,
  AiIcon,
  IntegrationsIcon,
  PropertyIcon,
  SaveIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import { useMemo } from 'react';

import type { SettingSidebarItem, SettingState } from '../types';
import { WorkspaceByokSetting } from './byok';
import { IntegrationSetting } from './integration';
import { WorkspaceSettingDetail } from './preference';
import { WorkspaceSettingProperties } from './properties';
import { WorkspaceSettingStorage } from './storage';

export const WorkspaceSetting = ({
  activeTab,
  scrollAnchor,
  onCloseSetting,
}: {
  activeTab: SettingTab;
  scrollAnchor?: string;
  onCloseSetting: () => void;
  onChangeSettingState: (settingState: SettingState) => void;
}) => {
  switch (activeTab) {
    case 'workspace:preference':
      return <WorkspaceSettingDetail onCloseSetting={onCloseSetting} />;
    case 'workspace:properties':
      return <WorkspaceSettingProperties />;
    case 'workspace:storage':
      return <WorkspaceSettingStorage onCloseSetting={onCloseSetting} />;
    case 'workspace:integrations':
      return <IntegrationSetting scrollAnchor={scrollAnchor} />;
    case 'workspace:embedding':
      return <EmbeddingSettings />;
    case 'workspace:byok':
      return <WorkspaceByokSetting />;
    default:
      return null;
  }
};

export const useWorkspaceSettingList = (): SettingSidebarItem[] => {
  const t = useI18n();

  const items = useMemo<SettingSidebarItem[]>(() => {
    return [
      {
        key: 'workspace:preference',
        title: t['com.affine.settings.workspace.preferences'](),
        icon: <SettingsIcon />,
        testId: 'workspace-setting:preference',
      },
      {
        key: 'workspace:properties',
        title: t['com.affine.settings.workspace.properties'](),
        icon: <PropertyIcon />,
        testId: 'workspace-setting:properties',
      },
      {
        key: 'workspace:integrations',
        title: t['com.affine.integration.integrations'](),
        icon: <IntegrationsIcon />,
        testId: 'workspace-setting:integrations',
      },
      {
        key: 'workspace:byok',
        title: 'AI',
        icon: <AiIcon />,
        testId: 'workspace-setting:byok',
      },
      {
        key: 'workspace:storage',
        title: t['Storage'](),
        icon: <SaveIcon />,
        testId: 'workspace-setting:storage',
      },
      {
        key: 'workspace:embedding',
        title:
          t[
            'com.affine.settings.workspace.indexer-embedding.embedding.title'
          ](),
        icon: <AiEmbeddingIcon />,
        testId: 'workspace-setting:embedding',
      },
    ].filter((item): item is SettingSidebarItem => !!item);
  }, [t]);

  return items;
};
