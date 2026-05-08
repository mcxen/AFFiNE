import { ErrorMessage, Skeleton } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { UserCopilotQuotaService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useEffect } from 'react';

import type { SettingState } from '../types';
import * as styles from './storage-progress.css';

export const AIUsagePanel = ({
  onChangeSettingState,
}: {
  onChangeSettingState?: (settingState: SettingState) => void;
}) => {
  const t = useI18n();
  void onChangeSettingState;
  const copilotQuotaService = useService(UserCopilotQuotaService);
  useEffect(() => {
    copilotQuotaService.copilotQuota.revalidate();
  }, [copilotQuotaService]);
  const copilotActionLimit = useLiveData(
    copilotQuotaService.copilotQuota.copilotActionLimit$
  );
  const copilotActionUsed = useLiveData(
    copilotQuotaService.copilotQuota.copilotActionUsed$
  );
  const loading = copilotActionLimit === null || copilotActionUsed === null;
  const loadError = useLiveData(copilotQuotaService.copilotQuota.error$);

  if (loading) {
    if (loadError) {
      return (
        <SettingRow
          name={t['com.affine.payment.ai.usage-title']()}
          desc={''}
          spreadCol={false}
        >
          {/* TODO(@catsjuice): i18n */}
          <ErrorMessage>Load error</ErrorMessage>
        </SettingRow>
      );
    }
    return (
      <SettingRow
        name={t['com.affine.payment.ai.usage-title']()}
        desc={''}
        spreadCol={false}
      >
        <Skeleton height={42} />
      </SettingRow>
    );
  }

  const percent =
    copilotActionLimit === 'unlimited'
      ? 0
      : Math.min(
          100,
          Math.max(
            0.5,
            Number(((copilotActionUsed / copilotActionLimit) * 100).toFixed(4))
          )
        );

  const color = percent > 80 ? cssVar('errorColor') : cssVar('processingColor');

  return (
    <SettingRow
      spreadCol={false}
      desc=""
      name={t['com.affine.payment.ai.usage-title']()}
    >
      {copilotActionLimit === 'unlimited' ? (
        t['com.affine.payment.ai.usage-description-purchased']()
      ) : (
        <div className={styles.storageProgressContainer}>
          <div className={styles.storageProgressWrapper}>
            <div className="storage-progress-desc">
              <span>{t['com.affine.payment.ai.usage.used-caption']()}</span>
              <span>
                {t['com.affine.payment.ai.usage.used-detail']({
                  used: copilotActionUsed.toString(),
                  limit: copilotActionLimit.toString(),
                })}
              </span>
            </div>

            <div className="storage-progress-bar-wrapper">
              <div
                className={styles.storageProgressBar}
                style={{ width: `${percent}%`, backgroundColor: color }}
              ></div>
            </div>
          </div>
        </div>
      )}
    </SettingRow>
  );
};
