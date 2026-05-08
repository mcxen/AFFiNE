import { notify } from '@affine/component';
import { type Notification } from '@affine/component/ui/notification';
import { EditorService } from '@affine/core/modules/editor';
import { useI18n } from '@affine/i18n';
import { AiIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import Lottie from 'lottie-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef } from 'react';

import { toggleEdgelessAIOnboarding } from './apis';
import * as styles from './edgeless.dialog.css';
import mouseTrackDark from './lottie/edgeless/mouse-track-dark.json';
import mouseTrackLight from './lottie/edgeless/mouse-track-light.json';
import {
  edgelessNotifyId$,
  localNotifyId$,
  showAIOnboardingGeneral$,
} from './state';

const EdgelessOnboardingAnimation = () => {
  const { resolvedTheme } = useTheme();

  const data = useMemo(() => {
    return resolvedTheme === 'dark' ? mouseTrackDark : mouseTrackLight;
  }, [resolvedTheme]);

  return (
    <div className={styles.thumb}>
      <Lottie
        loop
        autoplay
        animationData={data}
        className={styles.thumbContent}
      />
    </div>
  );
};

export const AIOnboardingEdgeless = () => {
  const editorService = useService(EditorService);

  const t = useI18n();
  const notifyId = useLiveData(edgelessNotifyId$);
  const generalAIOnboardingOpened = useLiveData(showAIOnboardingGeneral$);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mode = useLiveData(editorService.editor.mode$);

  const actions = useMemo(() => {
    const result: NonNullable<Notification['actions']> = [
      {
        key: 'get-started',
        label: (
          <span className={styles.getStartedButtonText}>
            {t['com.affine.ai-onboarding.edgeless.get-started']()}
          </span>
        ),
        onClick: () => {
          toggleEdgelessAIOnboarding(false);
        },
      },
    ];

    return result;
  }, [t]);

  useEffect(() => {
    if (generalAIOnboardingOpened) return;
    if (notifyId) return;
    if (mode !== 'edgeless') return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      // try to close local onboarding
      notify.dismiss(localNotifyId$.value);

      const id = notify(
        {
          title: t['com.affine.ai-onboarding.edgeless.title'](),
          message: t['com.affine.ai-onboarding.edgeless.message'](),
          icon: <AiIcon />,
          iconColor: cssVar('processingColor'),
          thumb: <EdgelessOnboardingAnimation />,
          alignMessage: 'icon',
          onDismiss: () => toggleEdgelessAIOnboarding(false),
          actions,
        },
        { duration: 1000 * 60 * 10 }
      );
      edgelessNotifyId$.next(id);
    }, 1000);
  }, [actions, generalAIOnboardingOpened, mode, notifyId, t]);

  return null;
};
