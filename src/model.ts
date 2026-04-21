/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import {PluginKey, type EditorState, type Transaction} from 'prosemirror-state';
import type {EditorView} from 'prosemirror-view';
import type {FloatingMenuPlugin} from './FloatingMenuPlugin';

export const CMPluginKey = new PluginKey<FloatingMenuPlugin>('floating-menu');

export interface SliceModel {
  name: string;
  description: string;
  id: string;
  referenceType: string;
  source: string;
  from: string;
  to: string;
  ids: string[];
}

export interface FloatRuntime {
  createSlice(slice: SliceModel): Promise<SliceModel>;

  retrieveSlices(): Promise<SliceModel[]>;

  insertInfoIconFloat(): void;

  insertCitationFloat(): void;

  insertReference(): Promise<SliceModel>;
}


export interface FloatingMenuContext {
  editorView: EditorView;
  editorState: EditorState;
  paragraphPos?: number;
}

export type FloatCommand = (
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  view: EditorView
) => unknown;

export interface FloatingMenuItem {
  /** Display label for the menu item */
  label: string;
  /** Action to perform when the menu item is clicked */
  onClick: FloatCommand;
  /** If the menu item should be disabled when menu is opened. Returns a string with the reason for being disabled. */
  disabled?: (ctx: FloatingMenuContext) => string | undefined | false;
  /** Optional hotkeys for the menu item */
  hotKeys?: string;
  /** If true, this action will perform an edit operation. For filtering out actions in Read-only mode. */
  isEdit?: boolean;
}


