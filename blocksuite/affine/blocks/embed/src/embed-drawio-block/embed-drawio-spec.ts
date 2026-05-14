import { EmbedDrawioBlockSchema } from '@blocksuite/affine-model';
import { BlockViewExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';

import { embedDrawioSlashMenuConfig } from './configs/slash-menu.js';

const flavour = EmbedDrawioBlockSchema.model.flavour;

export const EmbedDrawioViewExtensions: ExtensionType[] = [
  BlockViewExtension(flavour, () => literal`affine-embed-drawio-block`),
  SlashMenuConfigExtension(flavour, embedDrawioSlashMenuConfig),
];
