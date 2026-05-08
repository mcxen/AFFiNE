import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const operationMenu = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
});

export const account = style({
  padding: '4px 12px',
  userSelect: 'none',
  display: 'flex',
  gap: '12px',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const content = style({
  flexGrow: 1,
  minWidth: 0,
  maxWidth: '220px',
});
export const name = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  height: '22px',
});
export const email = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
  height: '20px',
});
