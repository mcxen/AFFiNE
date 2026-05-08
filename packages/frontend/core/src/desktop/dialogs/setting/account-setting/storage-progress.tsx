import { ErrorMessage, Skeleton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useEffect } from 'react';

import { UserQuotaService } from '../../../../modules/cloud';
import * as styles from './storage-progress.css';

export interface StorageProgressProgress {
  upgradable?: boolean;
  onUpgrade: () => void;
}

export const StorageProgress = ({ onUpgrade }: StorageProgressProgress) => {
  void onUpgrade;
  const t = useI18n();
  const quota = useService(UserQuotaService).quota;

  useEffect(() => {
    // revalidate quota to get the latest status
    quota.revalidate();
  }, [quota]);
  const color = useLiveData(quota.color$);
  const usedFormatted = useLiveData(quota.usedFormatted$);
  const maxFormatted = useLiveData(quota.maxFormatted$);
  const percent = useLiveData(quota.percent$);

  const quotaName = useLiveData(
    quota.quota$.map(q => (q !== null ? q?.humanReadable.name : null))
  );

  const loading = percent === null || quotaName === null;
  const loadError = useLiveData(quota.error$);

  if (loading) {
    if (loadError) {
      // TODO(@catsjuice): i18n
      return <ErrorMessage>Load error</ErrorMessage>;
    }
    return <Skeleton height={42} />;
  }

  return (
    <div className={styles.storageProgressContainer}>
      <div className={styles.storageProgressWrapper}>
        <div className="storage-progress-desc">
          <span>{t['com.affine.storage.used.hint']()}</span>
          <span>
            {usedFormatted}/{maxFormatted}
            {` (${quotaName} ${t['com.affine.storage.plan']()})`}
          </span>
        </div>

        <div className="storage-progress-bar-wrapper">
          <div
            className={styles.storageProgressBar}
            style={{
              width: `${percent}%`,
              backgroundColor: color ?? cssVar('processingColor'),
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};
