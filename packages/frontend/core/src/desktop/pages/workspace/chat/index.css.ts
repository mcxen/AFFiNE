import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

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

export const headerActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const headerButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: cssVarV2('icon/primary'),
  cursor: 'pointer',
  fontSize: 16,
  ':hover': {
    background: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const chatLayout = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  minHeight: 0,
});

export const historySidebar = style({
  width: 240,
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRight: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('layer/background/secondary'),
});

export const historyHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 12px 8px',
  fontSize: 12,
  fontWeight: 600,
  color: cssVarV2('text/secondary'),
});

export const historyList = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0 8px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});

export const historyItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 8px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  color: cssVarV2('text/primary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ':hover': {
    background: cssVarV2('layer/background/hoverOverlay'),
  },
  selectors: {
    '&[data-active="true"]': {
      background: cssVarV2('layer/background/hoverOverlay'),
      fontWeight: 500,
    },
  },
});

export const historyItemTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const historyItemDelete = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  borderRadius: 4,
  border: 'none',
  background: 'transparent',
  color: cssVarV2('icon/secondary'),
  cursor: 'pointer',
  opacity: 0,
  flexShrink: 0,
  fontSize: 14,
  selectors: {
    [`${historyItem}:hover &`]: {
      opacity: 1,
    },
  },
});

export const historyEmpty = style({
  padding: '24px 12px',
  textAlign: 'center',
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
  overflowWrap: 'anywhere',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  lineHeight: '22px',
  color: cssVarV2('text/primary'),
  background: cssVarV2('layer/background/secondary'),
});

export const messageDocs = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
});

export const messageDocChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  background: cssVarV2('layer/background/tertiary'),
});

export const markdownContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  whiteSpace: 'normal',
});

globalStyle(`${markdownContent} p`, {
  margin: 0,
  whiteSpace: 'pre-wrap',
});

globalStyle(`${markdownContent} ul`, {
  margin: 0,
  paddingLeft: 20,
});

globalStyle(`${markdownContent} li`, {
  margin: '2px 0',
});

globalStyle(`${markdownContent} pre`, {
  maxWidth: '100%',
  overflowX: 'auto',
  margin: 0,
  borderRadius: 6,
  padding: '8px 10px',
  background: cssVarV2('layer/background/tertiary'),
});

globalStyle(`${markdownContent} code`, {
  borderRadius: 4,
  padding: '1px 4px',
  fontFamily: 'monospace',
  background: cssVarV2('layer/background/tertiary'),
});

globalStyle(`${markdownContent} pre code`, {
  padding: 0,
  background: 'transparent',
});

globalStyle(`${markdownContent} a`, {
  color: cssVarV2('button/primary'),
});

export const markdownHeading = style({
  fontSize: 16,
  fontWeight: 600,
  lineHeight: '24px',
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

export const docContextRow = style({
  gridColumn: '1 / -1',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
});

export const docSelect = style({
  height: 28,
  maxWidth: 220,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 6,
  padding: '0 8px',
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/primary'),
  fontSize: 12,
  outline: 'none',
});

export const docChip = style({
  maxWidth: 220,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  borderRadius: 6,
  padding: '0 8px',
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/primary'),
  fontSize: 12,
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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
