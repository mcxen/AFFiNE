import { BlockModel } from '@blocksuite/store';

import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export const EmbedDrawioStyles = ['drawio'] as const satisfies EmbedCardStyle[];

export type EmbedDrawioBlockProps = {
  style: (typeof EmbedDrawioStyles)[number];
  caption: string | null;
  xml?: string;
  svgPreview?: string;
};

export class EmbedDrawioModel extends defineEmbedModel<EmbedDrawioBlockProps>(
  BlockModel
) {}
