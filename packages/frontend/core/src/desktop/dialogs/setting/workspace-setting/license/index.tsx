import { SettingHeader } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';

export const WorkspaceSettingLicense = () => {
  const t = useI18n();

  return (
    <SettingHeader
      title={t['com.affine.settings.workspace.license']()}
      subtitle={t['com.affine.settings.workspace.license.description']()}
    />
  );
};
