
import { EditorState } from 'prosemirror-state';

export interface FloatingMenuContext {
  editorState: EditorState;
  paragraphPos?: number;
}

export interface FloatingMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  isEnabled?: (ctx: FloatingMenuContext) => boolean;
}
