/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import {EditorView} from 'prosemirror-view';
import {FloatingMenuItem, type FloatingMenuContext} from './model';
import {Slice} from 'prosemirror-model';
import type {EditorState, Transaction} from 'prosemirror-state';

export function editorHasTextSelection(this: void, ctx: FloatingMenuContext) {
  return ctx?.editorView?.state?.selection?.empty
    ? 'No text selected'
    : undefined;
}

export interface MenuConfig {
  hasClipboard?: () => string | false;
}

export function getDefaultMenuItems(config?: MenuConfig): FloatingMenuItem[] {
  return [
    {
      label: 'Copy Without Formatting',
      disabled: editorHasTextSelection,
      onClick: copySelectionPlain,
    },
    {
      isEdit: true,
      label: 'Paste (Ctrl + V)',
      disabled: config?.hasClipboard,
      onClick: pasteFromClipboard,
      hotKeys: 'Mod-v',
    },
    {
      isEdit: true,
      label: 'Paste As Plain Text',
      disabled: config?.hasClipboard,
      onClick: pasteAsPlainText,
    },
  ];
}

export function copySelectionPlain(
  this: void,
  _state: EditorState,
  _dispatch: (tr: Transaction) => void,
  view: EditorView
) {
  if (!view.hasFocus()) {
    view.focus();
  }
  const {from, to} = view.state.selection;
  if (from === to) return;

  const slice = view.state.doc.slice(from, to);
  const text = slice.content.textBetween(0, slice.content.size, '\n');

  navigator.clipboard
    .writeText(text)
    .then(() => {})
    .catch((err) => console.error('Clipboard write failed:', err));
}

export async function pasteFromClipboard(
  this: void,
  _state: EditorState,
  _dispatch: (tr: Transaction) => void,
  view: EditorView
) {
  try {
    if (!view.hasFocus()) view.focus();

    const text = await navigator.clipboard.readText();
    let tr: Transaction;

    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const parsed = JSON.parse(text);
      const slice = Slice.fromJSON(view.state.schema, parsed);
      tr = view.state.tr.replaceSelection(slice);
    } else {
      tr = view.state.tr.insertText(
        text,
        view.state.selection.from,
        view.state.selection.to
      );
    }
    view.dispatch(tr.scrollIntoView());
  } catch (err) {
    console.error('Clipboard paste failed:', err);
  }
}

export async function pasteAsPlainText(
  this: void,
  _state: EditorState,
  _dispatch: (tr: Transaction) => void,
  view: EditorView
) {
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

    const {state} = view;
    const tr = state.tr.insertText(
      plainText,
      state.selection.from,
      state.selection.to
    );
    view.dispatch(tr.scrollIntoView());
  } catch (err) {
    console.error('Plain text paste failed:', err);
  }
}

export async function clipboardHasData(): Promise<boolean> {
  try {
    const text = await navigator.clipboard.readText();
    return !!text;
  } catch {
    return false;
  }
}

export async function clipboardHasProseMirrorData(): Promise<boolean> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return false;
    const parsed = JSON.parse(text);
    return !!(
      parsed &&
      typeof parsed === 'object' &&
      parsed.content &&
      (Array.isArray(parsed.content) || parsed.content.type)
    );
  } catch {
    return false;
  }
}