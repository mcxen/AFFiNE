import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { html } from 'lit';

const DrawioIcon = html`<span style="font-size:20px">◇</span>`;

export const embedDrawioSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'Draw.io Diagram',
      description: 'Insert a draw.io diagram',
      icon: DrawioIcon,
      group: '4_Content & Media@6',
      when: ({ model }) => {
        return model.store.schema.flavourSchemaMap.has('affine:embed-drawio');
      },
      action: ({ model }) => {
        const parent = model.store.getParent(model.id);
        if (!parent) return;
        const index = parent.children.indexOf(model) + 1;
        model.store.addBlock(
          'affine:embed-drawio',
          { xml: '', svgPreview: '' },
          parent.id,
          index
        );
      },
    },
  ],
};
