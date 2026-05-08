import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export {
  ellipsisTextOverflow,
  halo,
  icon,
  particles,
  root,
} from '../app-updater-button/index.css';
export const rootPadding = style({
  padding: '0 24px',
});
export const label = style({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  fontSize: cssVar('fontSm'),
  whiteSpace: 'nowrap',
});

export const closeIcon = style({
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  height: '18px',
  width: '18px',
  ':hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
});
