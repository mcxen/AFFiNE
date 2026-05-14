import { css } from 'lit';

export const styles = css`
  .affine-embed-drawio-block {
    position: relative;
    width: 100%;
    min-height: 200px;
    border: 1px solid var(--affine-border-color, #e3e2e4);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .affine-embed-drawio-block.selected {
    border-color: var(--affine-primary-color, #1e96eb);
    box-shadow: 0 0 0 2px rgba(30, 150, 235, 0.1);
  }

  .affine-embed-drawio-block:hover {
    border-color: var(--affine-primary-color, #1e96eb);
  }

  .affine-embed-drawio-preview {
    width: 100%;
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    background: #fafafa;
  }

  .affine-embed-drawio-preview svg {
    max-width: 100%;
    max-height: 400px;
    height: auto;
  }

  .affine-embed-drawio-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px 20px;
    color: var(--affine-text-secondary-color, #8e8d91);
    font-size: 14px;
  }

  .affine-embed-drawio-icon {
    font-size: 32px;
  }

  .affine-embed-drawio-title {
    padding: 8px 12px;
    border-top: 1px solid var(--affine-border-color, #e3e2e4);
    background: var(--affine-background-secondary-color, #fafafa);
    font-size: 12px;
    color: var(--affine-text-secondary-color, #8e8d91);
  }

  /* Editor Modal */
  .affine-embed-drawio-modal-mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .affine-embed-drawio-modal {
    width: min(1200px, 100%);
    height: min(800px, calc(100vh - 48px));
    background: white;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
  }

  .affine-embed-drawio-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--affine-border-color, #e3e2e4);
    font-size: 14px;
    font-weight: 500;
  }

  .affine-embed-drawio-modal-header button {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 18px;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .affine-embed-drawio-modal-header button:hover {
    background: #f0f0f0;
  }

  .embed-drawio-editor-iframe {
    flex: 1;
    width: 100%;
    border: none;
  }
`;
