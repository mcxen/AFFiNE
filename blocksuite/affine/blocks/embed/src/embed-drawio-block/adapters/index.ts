import type { ExtensionType } from '@blocksuite/store';

import { EmbedDrawioMarkdownAdapterExtension } from './markdown.js';

export * from './markdown.js';

export const EmbedDrawioBlockAdapterExtensions: ExtensionType[] = [
  EmbedDrawioMarkdownAdapterExtension,
];
