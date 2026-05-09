import { Loading } from '@affine/component';
import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { BlobManagementService } from '@affine/core/modules/blob-management/services';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import type { ListedBlobRecord } from '@affine/nbstore';
import { useService } from '@toeverything/infra';
import bytes from 'bytes';
import { useEffect, useMemo, useState } from 'react';

import { EnableCloudPanel } from '../preference/enable-cloud';
import { BlobManagementPanel } from './blob-management';
import { DesktopExportPanel } from './export';
import * as styles from './style.css';

type StorageCategory = {
  key: string;
  label: string;
  color: string;
  size: number;
};

const categoryForBlob = (blob: ListedBlobRecord) => {
  const mime = blob.mime || '';
  if (mime.startsWith('image/')) {
    return 'images';
  }
  if (mime.startsWith('audio/') || mime.startsWith('video/')) {
    return 'media';
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/pdf' ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('presentation') ||
    mime.includes('markdown')
  ) {
    return 'files';
  }
  return 'other';
};

const useWorkspaceStorageUsage = () => {
  const workspace = useService(WorkspaceService).workspace;
  const unusedBlobsEntity = useService(BlobManagementService).unusedBlobs;
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<StorageCategory[]>([]);

  useEffect(() => {
    const abortController = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        await workspace.engine.doc.storage.connection.waitForConnected(
          abortController.signal
        );
        await workspace.engine.blob.storage.connection.waitForConnected(
          abortController.signal
        );

        const [docTimestamps, blobs] = await Promise.all([
          workspace.engine.doc.storage.getDocTimestamps(),
          unusedBlobsEntity.listBlobs(),
        ]);

        if (abortController.signal.aborted) {
          return;
        }

        const docIds = Object.keys(docTimestamps);
        const docRecords = await Promise.all(
          docIds.map(docId => workspace.engine.doc.storage.getDoc(docId))
        );
        const docsSize = docRecords.reduce(
          (total, doc) => total + (doc?.bin.byteLength ?? 0),
          0
        );

        const blobTotals = {
          images: 0,
          media: 0,
          files: 0,
          other: 0,
        };
        for (const blob of blobs ?? []) {
          blobTotals[categoryForBlob(blob)] += blob.size;
        }

        setCategories([
          {
            key: 'documents',
            label: 'Documents',
            color: '#4C8DFF',
            size: docsSize,
          },
          {
            key: 'images',
            label: 'Images',
            color: '#22C55E',
            size: blobTotals.images,
          },
          {
            key: 'files',
            label: 'Files',
            color: '#F59E0B',
            size: blobTotals.files,
          },
          {
            key: 'media',
            label: 'Media',
            color: '#A855F7',
            size: blobTotals.media,
          },
          {
            key: 'other',
            label: 'Other',
            color: '#94A3B8',
            size: blobTotals.other,
          },
        ]);
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error(error);
          setCategories([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load().catch(console.error);

    return () => abortController.abort();
  }, [unusedBlobsEntity, workspace]);

  return { loading, categories };
};

const WorkspaceStorageUsagePanel = () => {
  const { loading, categories } = useWorkspaceStorageUsage();
  const total = useMemo(
    () => categories.reduce((sum, category) => sum + category.size, 0),
    [categories]
  );
  const visibleCategories = categories.filter(category => category.size > 0);

  if (loading) {
    return (
      <div className={styles.storageUsageLoading}>
        <Loading size={20} />
      </div>
    );
  }

  return (
    <div className={styles.storageUsagePanel}>
      <div className={styles.storageUsageHeader}>
        <div>
          <div className={styles.storageUsageTitle}>Current usage</div>
          <div className={styles.storageUsageDescription}>
            Documents, images, media, and other workspace files
          </div>
        </div>
        <div className={styles.storageUsageTotal}>
          {bytes(total, { unitSeparator: ' ' })}
        </div>
      </div>
      <div className={styles.storageUsageBar}>
        {visibleCategories.length ? (
          visibleCategories.map(category => (
            <div
              key={category.key}
              className={styles.storageUsageBarSegment}
              style={{
                width: `${Math.max((category.size / total) * 100, 1)}%`,
                backgroundColor: category.color,
              }}
            />
          ))
        ) : (
          <div className={styles.storageUsageBarEmpty} />
        )}
      </div>
      <div className={styles.storageUsageLegend}>
        {categories.map(category => (
          <div key={category.key} className={styles.storageUsageLegendItem}>
            <span
              className={styles.storageUsageLegendDot}
              style={{ backgroundColor: category.color }}
            />
            <span className={styles.storageUsageLegendName}>
              {category.label}
            </span>
            <span className={styles.storageUsageLegendSize}>
              {bytes(category.size, { unitSeparator: ' ' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const WorkspaceSettingStorage = ({
  onCloseSetting,
}: {
  onCloseSetting: () => void;
}) => {
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;
  return (
    <>
      <SettingHeader
        title={t['Storage']()}
        subtitle={t['com.affine.settings.workspace.storage.subtitle']()}
      />
      <SettingWrapper>
        <WorkspaceStorageUsagePanel />
      </SettingWrapper>
      {workspace.flavour === 'local' ? (
        <>
          <EnableCloudPanel onCloseSetting={onCloseSetting} />{' '}
          {BUILD_CONFIG.isElectron && (
            <SettingWrapper>
              <DesktopExportPanel workspace={workspace} />
            </SettingWrapper>
          )}
        </>
      ) : (
        <>
          {BUILD_CONFIG.isElectron && (
            <SettingWrapper>
              <DesktopExportPanel workspace={workspace} />
            </SettingWrapper>
          )}

          <SettingWrapper>
            <BlobManagementPanel />
          </SettingWrapper>
        </>
      )}
    </>
  );
};
