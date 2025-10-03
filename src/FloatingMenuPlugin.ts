// A generic Floating Menu ProseMirror Plugin
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Node, Schema, Slice } from 'prosemirror-model';
import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';
import {
  createPopUp,
  PopUpHandle,
  atAnchorBottomLeft,
} from '@modusoperandi/licit-ui-commands';
import { FloatingMenu } from './FloatingPopup';
import { v4 as uuidv4 } from 'uuid';
import { insertReference } from '@mo/licit-referencing';
import { addSliceToList, getDocumentslices, setSliceAtrrs, setSliceRuntime, setSlices } from './slice';
import { FloatRuntime } from './model';

export const CMPluginKey = new PluginKey<FloatingMenuPlugin>('floating-menu');
interface SliceModel {
  name: string;
  description: string;
  id: string;
  referenceType: string;
  source: string;
  from: string;
  to: string;
  ids: string[];
}

export class FloatingMenuPlugin extends Plugin {
  _popUpHandle: PopUpHandle | null = null;
  _view: EditorView | null = null;
  constructor(sliceRuntime: FloatRuntime) {
    super({
      key: CMPluginKey,
      state: {
        init(_config, state) {
          setSliceRuntime(sliceRuntime);
          return {
            decorations: getDecorations(state.doc, state),
          };
        },
        apply(tr, prev, _oldState, newState) {
        let decos = prev.decorations;

        if (!tr.docChanged) {
          return { decorations: decos.map(tr.mapping, tr.doc) };
        }

        decos = decos.map(tr.mapping, tr.doc);

        const requiresRescan =
          tr.steps.some((step) => {
            const s = step.toJSON();
            return (
              s.stepType === "replace" || 
              s.stepType === "replaceAround" ||
              s.stepType === "setNodeMarkup"
            );
          }) ||
          tr.getMeta(CMPluginKey)?.forceRescan;

        if (requiresRescan) {
          decos = getDecorations(tr.doc, newState);
        }

        return { decorations: decos };
      },
      },
      props: {
        decorations(state) {
          return (this as FloatingMenuPlugin).getState(state)?.decorations;
        },
      },
      view: (view) => {
        (this as FloatingMenuPlugin)._view = view;

        view.dom.addEventListener('pointerdown', (e) => {
          const targetEl = (e.target as HTMLElement).closest('.float-icon');
          if (!targetEl) return;

          e.preventDefault();
          e.stopPropagation();

          const hamburger = targetEl as HTMLElement;
          const wrapper = hamburger.closest('.pm-hamburger-wrapper') as HTMLElement;
          const pos = Number(hamburger.dataset.pos);

          const plugin = CMPluginKey.get(view.state) as FloatingMenuPlugin | null;
          if (!plugin || !plugin._view) return;

          if (plugin._popUpHandle) {
            plugin._popUpHandle.close(null);
            plugin._popUpHandle = null;
            wrapper?.classList.remove('popup-open');
            return;
          }

          wrapper?.classList.add('popup-open');

          clipboardHasProseMirrorData().then((hasPM) => {
            plugin._popUpHandle = createPopUp(
              FloatingMenu,
              {
                editorState: view.state, editorView: view, paragraphPos: pos, pasteAsReferenceEnabled: hasPM, copyRichHandler: () => {
                  copySelectionRich(view, plugin);
                },
                copyPlainHandler: () => {
                  copySelectionPlain(view, plugin);
                },
                pasteHandler: () => {
                  pasteFromClipboard(view, plugin);
                },
                pasteAsReferenceHandler: () => {
                  pasteAsReference(view, plugin);
                },
                pastePlainHandler: () => {
                  pasteAsPlainText(view, plugin);
                }
              },
              {
                anchor: hamburger,
                position: atAnchorBottomLeft,
                autoDismiss: false,
                onClose: () => {
                  plugin._popUpHandle = null;
                  wrapper?.classList.remove('popup-open');
                },
              }
            );
          });
        });

        const outsideClickHandler = (e: MouseEvent) => {
          const el = e.target as HTMLElement;
          if (
            this._popUpHandle &&
            !el.closest('.context-menu') &&
            !el.closest('.float-icon')
          ) {
            this._popUpHandle.close(null);
            this._popUpHandle = null;
          }
        };

        document.addEventListener('click', outsideClickHandler);
        getDocSlices(view);
        return {};
      },
    });
  }

  getEffectiveSchema(schema: Schema): Schema {
    return schema;
  }
}

export function copySelectionRich(view: EditorView, plugin: FloatingMenuPlugin) {
  const { state } = view;
  if (state.selection.empty) return;

  if (!view.hasFocus()) view.focus();

  const slice = state.selection.content();

  const sliceJSON = {
    content: slice.content.toJSON(),
    openStart: slice.openStart,
    openEnd: slice.openEnd,
    sliceModel: createSliceObject(view)
  };

  navigator.clipboard.writeText(JSON.stringify(sliceJSON))
    .then(() => console.log('Rich content copied'))
    .catch(err => console.error('Clipboard write failed', err));
  if (plugin._popUpHandle) {
    plugin._popUpHandle.update({
      ...plugin._popUpHandle['props'],
      pasteAsReferenceEnabled: true,
    });
  }
  if (plugin._popUpHandle?.close) {
    plugin._popUpHandle.close(null);
    plugin._popUpHandle = null;
  }
}

export function createSliceObject(editorView: EditorView): SliceModel {
  const instanceUrl = 'http://modusoperandi.com/editor/instance/';
  const referenceUrl = 'http://modusoperandi.com/ont/document#Reference_nodes';

  const sliceModel: SliceModel = {
    name: '',
    description: '',
    id: '',
    referenceType: '',
    source: '',
    from: '',
    to: '',
    ids: [],
  };

  const objectIds: string[] = [];
  let firstParagraphText: string | null = null;

  editorView.focus();

  const $from = editorView.state.selection.$from;
  const $to = editorView.state.selection.$to;

  const from = $from.start($from.depth);
  const to = $to.end($to.depth);

  editorView.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'paragraph') {
      if (!firstParagraphText && node.textContent?.trim()) {
        firstParagraphText = node.textContent.trim();
      }
      if (node.attrs?.objectId) {
        objectIds.push(node.attrs.objectId);
      }
    }
  });

  sliceModel.id = instanceUrl + uuidv4();
  sliceModel.ids = objectIds;
  sliceModel.from = objectIds.length > 0 ? objectIds[0] : '';
  sliceModel.to = objectIds.length > 0 ? objectIds[objectIds.length - 1] : '';

  const viewWithDocView = editorView as EditorView;
  sliceModel.source = viewWithDocView?.['docView']?.node?.attrs?.objectId;
  sliceModel.referenceType = referenceUrl;

  const today = new Date().toISOString().split('T')[0];
  const snippet = (firstParagraphText || 'Untitled').substring(0, 20);
  sliceModel.name = `${snippet} - ${today}`;

  return sliceModel;
}


export function copySelectionPlain(view: EditorView, plugin: FloatingMenuPlugin) {
  if (!view.hasFocus()) {
    view.focus();
  }
  const { from, to } = view.state.selection;
  if (from === to) return;

  const slice = view.state.doc.slice(from, to);
  const text = slice.content.textBetween(0, slice.content.size, '\n');

  navigator.clipboard.writeText(text)
    .then(() => console.log('Plain text copied!'))
    .catch((err) => console.error('Clipboard write failed:', err));
      if (plugin._popUpHandle?.close) {
    plugin._popUpHandle.close(null);
    plugin._popUpHandle = null;
  }
}

export async function pasteFromClipboard(view: EditorView, plugin: FloatingMenuPlugin) {
  try {
    if (!view.hasFocus()) view.focus();

    const text = await navigator.clipboard.readText();
    let tr: Transaction;

    try {
      // Try parsing as JSON slice
      const parsed = JSON.parse(text);
      const slice = Slice.fromJSON(view.state.schema, parsed);
      tr = view.state.tr.replaceSelection(slice);
    } catch (jsonErr) {
      // If not JSON, treat as plain text
      tr = view.state.tr.insertText(text, view.state.selection.from, view.state.selection.to);
    }

    view.dispatch(tr.scrollIntoView());
  } catch (err) {
    console.error('Clipboard paste failed:', err);
  } finally {
    if (plugin._popUpHandle?.close) {
      plugin._popUpHandle.close(null);
      plugin._popUpHandle = null;
    }
  }
}

export async function pasteAsReference(view: EditorView, plugin: FloatingMenuPlugin) {
  try {
    if (!view.hasFocus()) view.focus();

    const text = await navigator.clipboard.readText();
    const parsed = JSON.parse(text);

    const sliceModel: SliceModel = parsed.sliceModel;

      view['runtime']
      .createSlice(sliceModel)
      .then((val) => {
      insertReference(
      view,
      sliceModel.id,
      sliceModel.source,
      view['docView']?.node?.attrs?.objectMetaData.name
    );
        console.log('slice resolved with:', val);
      })
      .catch((err) => {
        console.error('slice failed with:', err);
      });
  } catch (err) {
    console.error('Failed to paste content from clipboard:', err);
  }

  if (plugin._popUpHandle?.close) {
    plugin._popUpHandle.close(null);
    plugin._popUpHandle = null;
  }
}

export async function pasteAsPlainText(view: EditorView, plugin: FloatingMenuPlugin) {
  try {
    if (!view.hasFocus()) view.focus();

    const text = await navigator.clipboard.readText();
    let plainText = text;

    try {
      const parsed = JSON.parse(text);
      const slice = Slice.fromJSON(view.state.schema, parsed);

      const frag = slice.content;
      plainText = '';
      frag.forEach((node) => {
        plainText += node.textContent + '\n';
      });
      plainText = plainText.trim();
    } catch {
      // Not JSON → just keep as is
    }

    const { state } = view;
    const tr = state.tr.insertText(plainText, state.selection.from, state.selection.to);
    view.dispatch(tr.scrollIntoView());
  } catch (err) {
    console.error('Plain text paste failed:', err);
  }

  if (plugin._popUpHandle?.close) {
    plugin._popUpHandle.close(null);
    plugin._popUpHandle = null;
  }
}

export async function clipboardHasProseMirrorData(): Promise<boolean> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return false;
    const parsed = JSON.parse(text);
    return (
      parsed &&
      typeof parsed === 'object' &&
      parsed.content &&
      Array.isArray(parsed.content) || parsed.content.type
    );
  } catch {
    return false;
  }
}


// --- Decoration function ---
export function getDecorations(doc: Node, state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];

  doc?.descendants((node: Node, pos: number) => {
    if (node.type.name === 'paragraph') {
      const wrapper = document.createElement('span');
      wrapper.className = 'pm-hamburger-wrapper';

      const hamburger = document.createElement('span');
      // ✅ Use FontAwesome
      hamburger.className = 'float-icon fa fa-bars';
      hamburger.style.fontFamily = 'FontAwesome'; // for fa compatibility
      hamburger.dataset.pos = String(pos);

      wrapper.appendChild(hamburger);

      decorations.push(Decoration.widget(pos + 1, wrapper, { side: 1 }));
    }
    const decoFlags = node.attrs?.isDeco;
    if (!decoFlags) return;

if (node.isBlock && node.type.name === 'paragraph') {
      const decoFlags = node.attrs?.isDeco || {};
      if (
        decoFlags.isSlice ||
        decoFlags.isTag ||
        decoFlags.isComment
      ) {
        // --- Container for gutter marks ---
        const container = document.createElement('span');
        container.style.position = 'absolute';
        container.style.left = '27px';
        container.style.display = 'inline-flex';
        container.style.gap = '6px';
        container.style.alignItems = 'center';
        container.contentEditable = 'false';
        container.style.userSelect = 'none';

        // --- Slice ---
        if (decoFlags.isSlice) {
          const SliceMark = document.createElement('span');
          SliceMark.id = `slicemark-${uuidv4()}`;
          SliceMark.style.fontFamily = 'FontAwesome';
          SliceMark.innerHTML = '&#xf097';
          SliceMark.onclick = () => console.log('Slice deco clicked');
          container.appendChild(SliceMark);
        }

        // --- Tag ---
        if (decoFlags.isTag) {
          const TagMark = document.createElement('span');
          TagMark.style.fontFamily = 'FontAwesome';
          TagMark.innerHTML = '&#xf02b;';
          TagMark.onclick = () => console.log('Tag deco clicked');
          container.appendChild(TagMark);
        }

        // --- Comment ---
        if (decoFlags.isComment) {
          const CommentMark = document.createElement('span');
          CommentMark.style.fontFamily = 'FontAwesome';
          CommentMark.innerHTML = '&#xf075;';
          CommentMark.onclick = () => console.log('Comment deco clicked');
          container.appendChild(CommentMark);
        }

        decorations.push(Decoration.widget(pos + 1, container, { side: -1 }));
      }
      return false; 
    }
  });

  return DecorationSet.create(state.doc, decorations);
}

// To retrieve all the document slices from the server and cache it.
export async function getDocSlices(view: EditorView) {
  try {
    const result = await getDocumentslices(view);
    setSlices(result, view.state);
    setSliceAtrrs(view);
  } catch (err) {
    console.error('Failed to load slices:', err);
  }
}


export function changeAttribute(_view: EditorView): void {
  const from = _view.state.selection.$from.before(1);
  const node = _view.state.doc.nodeAt(from);
  if (!node) return; // early return if node does not exist
  let tr = _view.state.tr;
  const newattrs = { ...node.attrs };
  const isDeco = { ...(newattrs.isDeco || {}) };
  isDeco.isSlice = true;
  newattrs.isDeco = isDeco;
  tr = tr.setNodeMarkup(from, undefined, newattrs);
  _view.dispatch(tr);
}


export function createNewSlice (_view: EditorView): void {
  const sliceModel = createSliceObject(_view);
  _view['runtime'].createSlice(sliceModel)
    .then((val) => {
      addSliceToList(val);
      changeAttribute(_view);
    })
    .catch((err) => {
      console.error('createSlice failed with:', err);
    });
}