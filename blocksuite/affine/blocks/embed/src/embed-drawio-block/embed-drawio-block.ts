import type {
  EmbedDrawioModel,
  EmbedDrawioStyles,
} from '@blocksuite/affine-model';
import { BlockSelection } from '@blocksuite/std';
import { html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import { EmbedBlockComponent } from '../common/embed-block-element.js';
import { styles } from './styles.js';

const DRAWIO_EDITOR_URL =
  'https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&configure=1';

export class EmbedDrawioBlockComponent extends EmbedBlockComponent<EmbedDrawioModel> {
  static override styles = styles;

  override _cardStyle: (typeof EmbedDrawioStyles)[number] = 'drawio';

  @state()
  private accessor _editorOpen = false;


  private _handleDoubleClick(event: MouseEvent) {
    event.stopPropagation();
    this._openEditor();
  }

  private _handleClick(event: MouseEvent) {
    event.stopPropagation();
    const selectionManager = this.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  }

  private _openEditor() {
    this._editorOpen = true;
  }

  private _closeEditor() {
    this._editorOpen = false;
  }

  private readonly _handleMessage = (event: MessageEvent) => {
    if (!this._editorOpen) return;
    let msg: { event?: string; xml?: string; data?: string };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const iframe = this.renderRoot?.querySelector(
      '.embed-drawio-editor-iframe'
    ) as HTMLIFrameElement | null;

    if (msg.event === 'init') {
      const xml = this.model.props.xml || '';
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ action: 'load', xml, autosave: 1 }),
        '*'
      );
    } else if (msg.event === 'save' || msg.event === 'autosave') {
      if (msg.xml) {
        this.std.store.updateBlock(this.blockId, { xml: msg.xml });
        iframe?.contentWindow?.postMessage(
          JSON.stringify({ action: 'export', format: 'svg' }),
          '*'
        );
      }
    } else if (msg.event === 'export') {
      if (msg.data) {
        this.std.store.updateBlock(this.blockId, { svgPreview: msg.data });
      }
    } else if (msg.event === 'exit') {
      this._closeEditor();
    }
  };


  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('message', this._handleMessage);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('message', this._handleMessage);
  }

  override renderBlock(): unknown {
    const hasDiagram = Boolean(
      this.model.props.xml || this.model.props.svgPreview
    );

    return this.renderEmbed(
      () => html`
        <div
          class=${classMap({
            'affine-embed-drawio-block': true,
            selected: this.selected$.value,
          })}
          @click=${this._handleClick}
          @dblclick=${this._handleDoubleClick}
        >
          ${this.model.props.svgPreview
            ? html`<div
                class="affine-embed-drawio-preview"
                .innerHTML=${this.model.props.svgPreview}
              ></div>`
            : html`<div class="affine-embed-drawio-placeholder">
                <span class="affine-embed-drawio-icon">◇</span>
                <span
                  >${hasDiagram
                    ? 'Draw.io Diagram'
                    : '双击编辑 Draw.io 图表'}</span
                >
              </div>`}
          <div class="affine-embed-drawio-title">
            <span class="affine-embed-drawio-title-text">Draw.io</span>
          </div>
        </div>

        ${this._editorOpen
          ? html`
              <div
                class="affine-embed-drawio-modal-mask"
                @click=${this._closeEditor}
              >
                <div
                  class="affine-embed-drawio-modal"
                  @click=${(e: Event) => e.stopPropagation()}
                >
                  <div class="affine-embed-drawio-modal-header">
                    <span>编辑 Draw.io 图表</span>
                    <button @click=${this._closeEditor}>✕</button>
                  </div>
                  <iframe
                    class="embed-drawio-editor-iframe"
                    src="${DRAWIO_EDITOR_URL}"
                    allow="clipboard-read; clipboard-write"
                  ></iframe>
                </div>
              </div>
            `
          : nothing}
      `
    );
  }
}
