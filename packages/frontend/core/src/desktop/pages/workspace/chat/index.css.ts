import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const localHeader = style({
  width: '100%',
  minHeight: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '0 20px',
  borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const localTitle = style({
  fontSize: 15,
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const localStatus = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const localRoot = style({
  width: '100%',
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: '24px 28px 18px',
  gap: 12,
});

export const messages = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '0 0 12px',
});

export const emptyState = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  color: cssVarV2('text/primary'),
});

export const emptyIcon = style({
  width: 52,
  height: 52,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  color: cssVarV2('button/primary'),
  background: cssVarV2('layer/background/secondary'),
  boxShadow: cssVar('buttonShadow'),
  fontSize: 30,
});

export const emptyTitle = style({
  fontSize: 20,
  fontWeight: 600,
});

const messageBase = style({
  maxWidth: 'min(760px, 88%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

export const userMessage = style([
  messageBase,
  {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
]);

export const assistantMessage = style([
  messageBase,
  {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
]);

export const messageRole = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const messageContent = style({
  maxWidth: '100%',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  lineHeight: '22px',
  color: cssVarV2('text/primary'),
  background: cssVarV2('layer/background/secondary'),
});

export const error = style({
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: cssVarV2('status/error'),
  background: cssVarV2('aI/errorBackground'),
});

export const inputPanel = style({
  minHeight: 104,
  display: 'grid',
  gridTemplateColumns: '1fr 40px',
  gap: 10,
  alignItems: 'end',
  borderRadius: 8,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('layer/background/primary'),
  boxShadow: cssVar('buttonShadow'),
  padding: 12,
});

export const contextPill = style({
  gridColumn: '1 / -1',
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
  gap: 8,
  borderRadius: 6,
  padding: '6px 8px',
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/secondary'),
});

export const contextLabel = style({
  fontSize: 12,
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const contextPreview = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 12,
});

export const clearContextButton = style({
  width: 22,
  height: 22,
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: cssVarV2('icon/secondary'),
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: '22px',
  padding: 0,
});

export const input = style({
  width: '100%',
  minHeight: 76,
  resize: 'none',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontSize: 15,
  lineHeight: '22px',
  fontFamily: 'inherit',
});

export const sendButton = style({
  width: 36,
  height: 36,
  border: 'none',
  borderRadius: '50%',
  background: cssVarV2('button/primary'),
  color: cssVarV2('button/pureWhiteText'),
  fontSize: 20,
  lineHeight: '36px',
  cursor: 'pointer',
  selectors: {
    '&:disabled': {
      cursor: 'not-allowed',
      background: cssVarV2('button/disable'),
      color: cssVarV2('text/disable'),
    },
  },
});

export const disclaimer = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});
