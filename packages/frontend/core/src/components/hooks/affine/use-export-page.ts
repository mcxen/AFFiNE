import { notify } from '@affine/component';
import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor/blocksuite-editor';
import { DocsService } from '@affine/core/modules/doc';
import { EditorService } from '@affine/core/modules/editor';
import { getAFFiNEWorkspaceSchema } from '@affine/core/modules/workspace/global-schema';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { ExportManager } from '@blocksuite/affine/blocks/surface';
import {
  docLinkBaseURLMiddleware,
  embedSyncedDocMiddleware,
  HtmlAdapterFactoryIdentifier,
  MarkdownAdapterFactoryIdentifier,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import { printToPdf } from '@blocksuite/affine/shared/utils';
import type { BlockStdScope } from '@blocksuite/affine/std';
import { type Store, Transformer } from '@blocksuite/affine/store';
import {
  createAssetsArchive,
  download,
  HtmlTransformer,
  MarkdownTransformer,
  PdfTransformer,
  ZipTransformer,
} from '@blocksuite/affine/widgets/linked-doc';
import { getAssetName } from '@blocksuite/store';
import { useLiveData, useService } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';

import { useAsyncCallback } from '../affine-async-hooks';

type ExportType =
  | 'pdf'
  | 'html'
  | 'png'
  | 'markdown'
  | 'markdown-all-docs'
  | 'markdown-with-linked-docs'
  | 'copy-markdown'
  | 'snapshot'
  | 'pdf-export';

interface ExportHandlerOptions {
  page: Store;
  editorContainer: AffineEditorContainer;
  type: ExportType;
}

interface AdapterResult {
  file: string;
  assetsIds: string[];
}

type AdapterFactoryIdentifier =
  | typeof HtmlAdapterFactoryIdentifier
  | typeof MarkdownAdapterFactoryIdentifier;

interface AdapterConfig {
  identifier: AdapterFactoryIdentifier;
  fileExtension: string; // file extension need to be lower case with dot prefix, e.g. '.md', '.txt', '.html'
  contentType: string;
  indexFileName: string;
}

interface ExportedMarkdownDoc {
  doc: Store;
  markdown: string;
  assetsIds: string[];
}

type ExportDirectoryHandle = {
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<ExportDirectoryHandle>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

type WindowWithDirectoryPicker = Window &
  typeof globalThis & {
    showDirectoryPicker?: () => Promise<ExportDirectoryHandle>;
  };

function createTransformer(doc: Store) {
  return new Transformer({
    schema: getAFFiNEWorkspaceSchema(),
    blobCRUD: doc.workspace.blobSync,
    docCRUD: {
      create: (id: string) => doc.workspace.createDoc(id).getStore({ id }),
      get: (id: string) => doc.workspace.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => doc.workspace.removeDoc(id),
    },
    middlewares: [
      docLinkBaseURLMiddleware(doc.workspace.id),
      titleMiddleware(doc.workspace.meta.docMetas),
      embedSyncedDocMiddleware('content'),
    ],
  });
}

async function exportDoc(
  doc: Store,
  std: BlockStdScope,
  config: AdapterConfig
) {
  const transformer = createTransformer(doc);

  const adapterFactory = std.store.provider.get(config.identifier);
  const adapter = adapterFactory.get(transformer);
  const result = (await adapter.fromDoc(doc)) as AdapterResult;

  if (!result || (!result.file && !result.assetsIds.length)) {
    return;
  }

  const docTitle = doc.meta?.title || 'Untitled';
  const contentBlob = new Blob([result.file], { type: config.contentType });

  let downloadBlob: Blob;
  let name: string;

  if (result.assetsIds.length > 0) {
    if (!transformer.assets) {
      throw new Error('No assets found');
    }
    const zip = await createAssetsArchive(transformer.assets, result.assetsIds);
    await zip.file(config.indexFileName, contentBlob);
    downloadBlob = await zip.generate();
    name = `${docTitle}.zip`;
  } else {
    downloadBlob = contentBlob;
    name = `${docTitle}${config.fileExtension}`;
  }

  download(downloadBlob, name);
}

function sanitizeFilename(name: string) {
  return (
    [...name]
      .map(char => (char.charCodeAt(0) < 32 ? '-' : char))
      .join('')
      .trim()
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 120) || 'Untitled'
  );
}

function uniqueMarkdownPath(
  doc: Store,
  usedPaths: Set<string>,
  isIndex: boolean
) {
  if (isIndex) {
    usedPaths.add('index.md');
    return 'index.md';
  }

  const base = sanitizeFilename(doc.meta?.title || doc.id || 'Untitled');
  let path = `docs/${base}.md`;
  let index = 2;

  while (usedPaths.has(path)) {
    path = `docs/${base}-${index}.md`;
    index++;
  }

  usedPaths.add(path);
  return path;
}

function splitExportPath(path: string) {
  return path.split('/').filter(Boolean).map(sanitizeFilename);
}

async function writeFileToDirectory(
  root: ExportDirectoryHandle,
  filePath: string,
  content: Blob | string
) {
  const parts = splitExportPath(filePath);
  const fileName = parts.pop();
  if (!fileName) {
    return;
  }

  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }

  const file = await dir.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

async function writeMarkdownExportToFolder(
  exportedDocs: ExportedMarkdownDoc[],
  assets: Map<string, Blob>,
  allAssetsIds: string[],
  rootDoc: Store
) {
  const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker as
    | (() => Promise<ExportDirectoryHandle>)
    | undefined;
  if (!picker) {
    return false;
  }

  let root: ExportDirectoryHandle;
  try {
    root = await picker();
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') {
      return true;
    }
    throw error;
  }
  const usedPaths = new Set<string>();

  for (const exportedDoc of exportedDocs) {
    const path = uniqueMarkdownPath(
      exportedDoc.doc,
      usedPaths,
      exportedDoc.doc.id === rootDoc.id
    );
    await writeFileToDirectory(root, path, exportedDoc.markdown);
  }

  for (const [id, blob] of assets) {
    if (!allAssetsIds.includes(id)) {
      continue;
    }
    await writeFileToDirectory(
      root,
      `assets/${getAssetName(assets, id)}`,
      blob
    );
  }

  return true;
}

function collectLinkedDocIdsFromValue(
  value: unknown,
  docId: string,
  linkedDocIds: Set<string>,
  seen = new WeakSet<object>()
) {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (
    record.type === 'LinkedPage' &&
    typeof record.pageId === 'string' &&
    record.pageId !== docId
  ) {
    linkedDocIds.add(record.pageId);
  }

  const props = record.props as Record<string, unknown> | undefined;
  if (
    (record.flavour === 'affine:embed-linked-doc' ||
      record.flavour === 'affine:embed-synced-doc') &&
    typeof props?.pageId === 'string' &&
    props.pageId !== docId
  ) {
    linkedDocIds.add(props.pageId);
  }

  const maybeText = props?.text as { toDelta?: () => unknown } | undefined;
  if (typeof maybeText?.toDelta === 'function') {
    collectLinkedDocIdsFromValue(
      maybeText.toDelta(),
      docId,
      linkedDocIds,
      seen
    );
  }

  if (Array.isArray(value)) {
    value.forEach(item =>
      collectLinkedDocIdsFromValue(item, docId, linkedDocIds, seen)
    );
    return;
  }

  for (const childValue of Object.values(record)) {
    collectLinkedDocIdsFromValue(childValue, docId, linkedDocIds, seen);
  }
}

function collectLinkedDocIds(doc: Store) {
  const linkedDocIds = new Set<string>();
  doc
    .getAllModels()
    .forEach(model =>
      collectLinkedDocIdsFromValue(model, doc.id, linkedDocIds)
    );

  return [...linkedDocIds];
}

async function collectMarkdownExportDocs(
  rootDoc: Store,
  docsService: DocsService
) {
  const docs: Store[] = [];
  const visited = new Set<string>();
  const queue = [rootDoc.id];

  while (queue.length > 0) {
    const docId = queue.shift();
    if (!docId || visited.has(docId)) {
      continue;
    }
    visited.add(docId);

    const docStore = rootDoc.workspace.getDoc(docId)?.getStore({ id: docId });
    if (!docStore) {
      continue;
    }

    const loaded = docsService.open(docId);
    const disposePriorityLoad = loaded.doc.addPriorityLoad(10);
    try {
      await loaded.doc.waitForSyncReady();
      collectLinkedDocIds(docStore).forEach(linkedDocId => {
        if (!visited.has(linkedDocId)) {
          queue.push(linkedDocId);
        }
      });
      docs.push(docStore);
    } finally {
      disposePriorityLoad();
      loaded.release();
    }
  }

  return docs;
}

async function exportToMarkdownWithLinkedDocs(
  doc: Store,
  docsService: DocsService,
  std?: BlockStdScope
) {
  if (!std) {
    await exportToMarkdown(doc, std);
    return;
  }

  const transformer = createTransformer(doc);
  const adapterFactory = std.store.provider.get(
    MarkdownAdapterFactoryIdentifier
  );
  const adapter = adapterFactory.get(transformer);
  const docs = await collectMarkdownExportDocs(doc, docsService);
  const exportedDocs: ExportedMarkdownDoc[] = [];

  for (const targetDoc of docs) {
    const result = (await adapter.fromDoc(targetDoc)) as AdapterResult;
    if (!result) {
      continue;
    }
    exportedDocs.push({
      doc: targetDoc,
      markdown: result.file ?? '',
      assetsIds: result.assetsIds,
    });
  }

  if (exportedDocs.length === 0) {
    return;
  }

  const allAssetsIds = [
    ...new Set(exportedDocs.flatMap(exportedDoc => exportedDoc.assetsIds)),
  ];
  const assets = transformer.assets ?? new Map<string, Blob>();
  if (
    await writeMarkdownExportToFolder(exportedDocs, assets, allAssetsIds, doc)
  ) {
    return;
  }

  const zip = await createAssetsArchive(assets, allAssetsIds);
  const usedPaths = new Set<string>();

  for (const exportedDoc of exportedDocs) {
    const path = uniqueMarkdownPath(
      exportedDoc.doc,
      usedPaths,
      exportedDoc.doc.id === doc.id
    );
    await zip.file(
      path,
      new Blob([exportedDoc.markdown], { type: 'text/plain' })
    );
  }

  const docTitle = doc.meta?.title || 'Untitled';
  download(await zip.generate(), `${docTitle}.zip`);
}

async function exportAllDocsToMarkdown(
  doc: Store,
  docsService: DocsService,
  std?: BlockStdScope
) {
  if (!std) {
    await exportToMarkdown(doc, std);
    return;
  }

  const transformer = createTransformer(doc);
  const adapterFactory = std.store.provider.get(
    MarkdownAdapterFactoryIdentifier
  );
  const adapter = adapterFactory.get(transformer);
  const docs = docsService.list.docs$.value
    .filter(docRecord => !docRecord.trash$.value)
    .map(docRecord =>
      doc.workspace.getDoc(docRecord.id)?.getStore({ id: docRecord.id })
    )
    .filter((store): store is Store => !!store);
  const exportedDocs: ExportedMarkdownDoc[] = [];

  for (const targetDoc of docs) {
    const loaded = docsService.open(targetDoc.id);
    const disposePriorityLoad = loaded.doc.addPriorityLoad(10);
    try {
      await loaded.doc.waitForSyncReady();
      const result = (await adapter.fromDoc(targetDoc)) as AdapterResult;
      if (!result) {
        continue;
      }
      exportedDocs.push({
        doc: targetDoc,
        markdown: result.file ?? '',
        assetsIds: result.assetsIds,
      });
    } finally {
      disposePriorityLoad();
      loaded.release();
    }
  }

  if (exportedDocs.length === 0) {
    return;
  }

  const allAssetsIds = [
    ...new Set(exportedDocs.flatMap(exportedDoc => exportedDoc.assetsIds)),
  ];
  const assets = transformer.assets ?? new Map<string, Blob>();
  if (
    await writeMarkdownExportToFolder(exportedDocs, assets, allAssetsIds, doc)
  ) {
    return;
  }

  const zip = await createAssetsArchive(assets, allAssetsIds);
  const usedPaths = new Set<string>();

  for (const exportedDoc of exportedDocs) {
    const path = uniqueMarkdownPath(exportedDoc.doc, usedPaths, false);
    await zip.file(
      path,
      new Blob([exportedDoc.markdown], { type: 'text/plain' })
    );
  }

  const docTitle = doc.meta?.title || 'workspace';
  download(await zip.generate(), `${docTitle}-all-docs.zip`);
}

export async function exportDocsToMarkdownCollection({
  rootDoc,
  docs,
  docsService,
  std,
  fileName,
}: {
  rootDoc: Store;
  docs: Store[];
  docsService: DocsService;
  std?: BlockStdScope;
  fileName: string;
}) {
  if (!std) {
    return false;
  }

  const transformer = createTransformer(rootDoc);
  const adapterFactory = std.store.provider.get(
    MarkdownAdapterFactoryIdentifier
  );
  const adapter = adapterFactory.get(transformer);
  const exportedDocs: ExportedMarkdownDoc[] = [];

  for (const targetDoc of docs) {
    const loaded = docsService.open(targetDoc.id);
    const disposePriorityLoad = loaded.doc.addPriorityLoad(10);
    try {
      await loaded.doc.waitForSyncReady();
      const result = (await adapter.fromDoc(targetDoc)) as AdapterResult;
      if (!result) {
        continue;
      }
      exportedDocs.push({
        doc: targetDoc,
        markdown: result.file ?? '',
        assetsIds: result.assetsIds,
      });
    } finally {
      disposePriorityLoad();
      loaded.release();
    }
  }

  if (exportedDocs.length === 0) {
    return false;
  }

  const allAssetsIds = [
    ...new Set(exportedDocs.flatMap(exportedDoc => exportedDoc.assetsIds)),
  ];
  const assets = transformer.assets ?? new Map<string, Blob>();
  if (
    await writeMarkdownExportToFolder(
      exportedDocs,
      assets,
      allAssetsIds,
      rootDoc
    )
  ) {
    return true;
  }

  const zip = await createAssetsArchive(assets, allAssetsIds);
  const usedPaths = new Set<string>();

  for (const exportedDoc of exportedDocs) {
    const path = uniqueMarkdownPath(exportedDoc.doc, usedPaths, false);
    await zip.file(
      path,
      new Blob([exportedDoc.markdown], { type: 'text/plain' })
    );
  }

  download(await zip.generate(), `${sanitizeFilename(fileName)}.zip`);
  return true;
}

async function exportToHtml(doc: Store, std?: BlockStdScope) {
  if (!std) {
    // If std is not provided, we use the default export method
    await HtmlTransformer.exportDoc(doc);
  } else {
    await exportDoc(doc, std, {
      identifier: HtmlAdapterFactoryIdentifier,
      fileExtension: '.html',
      contentType: 'text/html',
      indexFileName: 'index.html',
    });
  }
}

async function exportToMarkdown(doc: Store, std?: BlockStdScope) {
  if (!std) {
    // If std is not provided, we use the default export method
    await MarkdownTransformer.exportDoc(doc);
  } else {
    await exportDoc(doc, std, {
      identifier: MarkdownAdapterFactoryIdentifier,
      fileExtension: '.md',
      contentType: 'text/plain',
      indexFileName: 'index.md',
    });
  }
}

async function copyAsMarkdown(doc: Store, std?: BlockStdScope) {
  if (!std) {
    return false;
  }

  try {
    const transformer = createTransformer(doc);
    const adapterFactory = std.store.provider.get(
      MarkdownAdapterFactoryIdentifier
    );
    const adapter = adapterFactory.get(transformer);
    const result = (await adapter.fromDoc(doc)) as AdapterResult;

    if (!result || result.file === undefined) {
      return false;
    }

    await navigator.clipboard.writeText(result.file);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function exportHandler({
  page,
  type,
  editorContainer,
  docsService,
}: ExportHandlerOptions & { docsService: DocsService }): Promise<boolean> {
  const editorRoot = document.querySelector('editor-host');
  track.$.sharePanel.$.export({
    type,
  });
  switch (type) {
    case 'html':
      await exportToHtml(page, editorRoot?.std);
      return true;
    case 'markdown':
      await exportToMarkdown(page, editorRoot?.std);
      return true;
    case 'markdown-all-docs':
      await exportAllDocsToMarkdown(page, docsService, editorRoot?.std);
      return true;
    case 'markdown-with-linked-docs':
      await exportToMarkdownWithLinkedDocs(page, docsService, editorRoot?.std);
      return true;
    case 'copy-markdown':
      return await copyAsMarkdown(page, editorRoot?.std);
    case 'snapshot':
      await ZipTransformer.exportDocs(
        page.workspace,
        getAFFiNEWorkspaceSchema(),
        [page]
      );
      return true;
    case 'pdf':
      await printToPdf(editorContainer);
      return true;
    case 'png': {
      const std = editorRoot?.std;
      if (!std) return false;
      await std.get(ExportManager).exportPng();
      return true;
    }
    case 'pdf-export': {
      await PdfTransformer.exportDoc(page);
      return true;
    }
  }

  return false;
}

export const useExportPage = () => {
  const editor = useService(EditorService).editor;
  const docsService = useService(DocsService);
  const editorContainer = useLiveData(editor.editorContainer$);
  const blocksuiteDoc = editor.doc.blockSuiteDoc;
  const pushGlobalLoadingEvent = useSetAtom(pushGlobalLoadingEventAtom);
  const resolveGlobalLoadingEvent = useSetAtom(resolveGlobalLoadingEventAtom);
  const t = useI18n();

  const onClickHandler = useAsyncCallback(
    async (type: ExportType) => {
      if (editorContainer === null) return;

      // editor container is wrapped by a proxy, we need to get the origin
      const originEditorContainer = (editorContainer as any)
        .origin as AffineEditorContainer;

      const globalLoadingID = nanoid();
      pushGlobalLoadingEvent({
        key: globalLoadingID,
      });
      try {
        const success = await exportHandler({
          page: blocksuiteDoc,
          type,
          editorContainer: originEditorContainer,
          docsService,
        });

        if (!success) {
          notify.error({
            title: t['com.affine.export.error.title'](),
            message: t['com.affine.export.error.message'](),
          });
          return;
        }

        if (type === 'copy-markdown') {
          notify.success({
            title: t['com.affine.export.copied-as-markdown'](),
          });
        } else {
          notify.success({
            title: t['com.affine.export.success.title'](),
            message: t['com.affine.export.success.message'](),
          });
        }
      } catch (err) {
        console.error(err);
        notify.error({
          title: t['com.affine.export.error.title'](),
          message: t['com.affine.export.error.message'](),
        });
      } finally {
        resolveGlobalLoadingEvent(globalLoadingID);
      }
    },
    [
      blocksuiteDoc,
      docsService,
      editorContainer,
      pushGlobalLoadingEvent,
      resolveGlobalLoadingEvent,
      t,
    ]
  );

  return onClickHandler;
};
