import { ImageBlockComponent } from '@blocksuite/affine/blocks/image';
import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { SelectTextIcon } from '@blocksuite/icons/lit';

import { AIProvider } from '../../provider';

async function extractOcrText(block: ImageBlockComponent): Promise<string> {
  const sourceId = block.model.props.sourceId$.peek();
  if (!sourceId) throw new Error('Image has no source');

  const blob = await block.store.blobSync.get(sourceId);
  if (!blob) throw new Error('Image blob not found');

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const chat = AIProvider.actions.chat;
  if (!chat) throw new Error('AI chat not available');

  const stream = await chat({
    input:
      'Extract ALL text from this image. Return ONLY the extracted text, no explanations.',
    attachments: [`data:${blob.type || 'image/png'};base64,${base64}`],
    workspaceId: block.store.workspace.id,
    stream: false,
  });

  let result = '';
  if (typeof stream === 'string') {
    result = stream;
  } else if (stream && Symbol.asyncIterator in (stream as object)) {
    for await (const chunk of stream as AsyncIterable<string>) {
      result += chunk;
    }
  }
  return result.trim();
}

export function imageOcrToolbarConfig(): ToolbarModuleConfig {
  return {
    actions: [
      {
        placement: ActionPlacement.More,
        id: 'b.ocr',
        actions: [
          {
            id: 'a.extract-text',
            label: 'Extract Text (OCR)',
            icon: SelectTextIcon(),
            when(ctx) {
              const block = ctx.getCurrentBlockByType(ImageBlockComponent);
              return !!block?.model.props.sourceId$.peek();
            },
            run(ctx) {
              const block = ctx.getCurrentBlockByType(ImageBlockComponent);
              if (!block) return;

              extractOcrText(block)
                .then(ocrText => {
                  if (!ocrText) return;
                  block.store.updateBlock(block.model, { ocrText } as any);
                })
                .catch(err => {
                  console.error('OCR failed:', err);
                });
            },
          },
        ],
      },
    ],
  };
}
