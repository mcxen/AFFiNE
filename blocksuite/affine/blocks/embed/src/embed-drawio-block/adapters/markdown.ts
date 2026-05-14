import { EmbedDrawioBlockSchema } from '@blocksuite/affine-model';
import { BlockMarkdownAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockMarkdownAdapterMatcher } from '../../common/adapters/markdown.js';

const flavour = EmbedDrawioBlockSchema.model.flavour;

export const embedDrawioBlockMarkdownAdapterMatcher =
  createEmbedBlockMarkdownAdapterMatcher(flavour, {
    fromBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext } = context;
        const xml = o.node.props.xml as string | undefined;
        // Export as a fenced code block with drawio language identifier
        // This allows round-trip: import can detect ```drawio blocks
        const content = xml || '';
        walkerContext
          .openNode(
            {
              type: 'code',
              lang: 'drawio',
              meta: null,
              value: content,
            },
            'children'
          )
          .closeNode();
      },
    },
    toMatch: o => {
      // Match fenced code blocks with lang=drawio
      const node = o.node;
      return (
        node.type === 'code' && (node as { lang?: string }).lang === 'drawio'
      );
    },
    toBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext } = context;
        const node = o.node as { value?: string };
        walkerContext
          .openNode({
            type: 'block',
            id: '',
            flavour,
            props: {
              xml: node.value || '',
              svgPreview: undefined,
              style: 'drawio',
              caption: null,
            },
            children: [],
          })
          .closeNode();
      },
    },
  });

export const EmbedDrawioMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(embedDrawioBlockMarkdownAdapterMatcher);
