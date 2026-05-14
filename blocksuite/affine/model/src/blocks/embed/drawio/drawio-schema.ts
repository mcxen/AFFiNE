import { BlockSchemaExtension } from '@blocksuite/store';

import { createEmbedBlockSchema } from '../../../utils/index.js';
import {
  type EmbedDrawioBlockProps,
  EmbedDrawioModel,
  EmbedDrawioStyles,
} from './drawio-model.js';

const defaultEmbedDrawioProps: EmbedDrawioBlockProps = {
  style: EmbedDrawioStyles[0],
  caption: null,
  xml: undefined,
  svgPreview: undefined,
};

export const EmbedDrawioBlockSchema = createEmbedBlockSchema({
  name: 'drawio',
  version: 1,
  toModel: () => new EmbedDrawioModel(),
  props: (): EmbedDrawioBlockProps => defaultEmbedDrawioProps,
});

export const EmbedDrawioBlockSchemaExtension = BlockSchemaExtension(
  EmbedDrawioBlockSchema
);
