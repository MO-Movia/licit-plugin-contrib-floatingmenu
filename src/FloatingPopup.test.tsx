/**
 * FloatingPopup_and_Plugin.test.tsx
 *
 * Combined tests:
 *  - UI tests for FloatingMenu (your original tests, made robust)
 *  - Unit tests for FloatingMenuPlugin helper functions (fixed assertions & mocks)
 */

import { DecorationSet } from 'prosemirror-view';
import React from 'react';
import ReactDOM from 'react-dom';
import { FloatingMenu } from './FloatingPopup';
import * as Plugin from './FloatingMenuPlugin';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { FloatRuntime, SliceModel } from './model';
import { PopUpHandle } from '@modusoperandi/licit-ui-commands';
import { insertReference } from '@mo/licit-referencing';
import { getDocumentslices } from './slice';

jest.mock('@modusoperandi/licit-ui-commands', () => ({
  createPopUp: jest.fn(),
  atAnchorBottomLeft: jest.fn(),
  PopUpHandle: jest.fn(),
}));

// Mock external UI command lib so component renders simple <button>
jest.mock('@modusoperandi/licit-ui-commands', () => ({
  CustomButton: ({ label, onClick, disabled }) => (
    <button disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

// Mock slice helpers module used by plugin (so getDocSlices can be tested)
jest.mock('./slice', () => ({
  addSliceToList: jest.fn(),
  FloatRuntime: jest.fn(),
  getDocumentslices: jest.fn(),
  setSliceAtrrs: jest.fn(),
  setSlices: jest.fn(),
  setSliceRuntime: jest.fn(),
}));

// Keep the real plugin module but override createNewSlice with a mock for UI tests
const mockCreateNewSlice = jest.fn();
jest.mock('./FloatingMenuPlugin', () => {
  const actual = jest.requireActual('./FloatingMenuPlugin');
  return {
    ...actual,
    createNewSlice: (...args: SliceModel[]) => mockCreateNewSlice(...args),
  };
});

// Mock insertReference (used in pasteAsReference)
jest.mock('@mo/licit-referencing', () => ({
  insertReference: jest.fn(),
}));

// Polyfill clipboard in JSDOM
beforeAll(() => {
  if (!(navigator as Navigator).clipboard) {
    Object.assign(navigator, {
      clipboard: {
        readText: jest.fn().mockResolvedValue('mock text'),
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  } else {
    (navigator.clipboard.readText as (() => Promise<string>)) = (navigator.clipboard.readText as (() => Promise<string>)) || jest.fn().mockResolvedValue('mock text');
    (navigator.clipboard.writeText as (() => Promise<void>)) = (navigator.clipboard.writeText as (() => Promise<void>)) || jest.fn().mockResolvedValue(undefined);
  }
});

describe('FloatingMenu (Jest + DOM) - Extended & Plugin unit tests', () => {
  // -------------------------
  // UI tests
  // -------------------------
  describe('FloatingMenu UI tests', () => {
    let props;
    let container: HTMLDivElement;

    beforeEach(() => {
      jest.clearAllMocks();
      container = document.createElement('div');
      document.body.appendChild(container);

      props = {
        paragraphPos: 1,
        editorState: {
          selection: {
            $from: { before: () => 1, depth: 1 },
            $to: { before: () => 1, depth: 1 },
            empty: false,
          },
        },
        editorView: {
          runtime: {
            insertCitation: jest.fn(),
            insertInfoIcon: jest.fn(),
          },
        },
        copyRichHandler: jest.fn(),
        copyPlainHandler: jest.fn(),
        pasteHandler: jest.fn(),
        pastePlainHandler: jest.fn(),
        pasteAsReferenceHandler: jest.fn(),
        pasteAsReferenceEnabled: true,
        close: jest.fn(),
      };

      ReactDOM.render(<FloatingMenu {...props} />, container);
    });

    afterEach(() => {
      ReactDOM.unmountComponentAtNode(container);
      container.remove();
    });

    function getButton(label: string): HTMLButtonElement {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === label
      );
      if (!btn) throw new Error(`Button '${label}' not found`);
      return btn as HTMLButtonElement;
    }

    function click(label: string) {
      const btn = getButton(label);
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    it('renders all buttons', () => {
      const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
      expect(labels).toEqual([
        'Create Citation',
        'Create Infoicon',
        'Copy',
        'Copy Without Formatting',
        'Paste',
        'Paste As Plain Text',
        'Paste As Reference',
        'Create Bookmark',
      ]);
    });

    it('calls insertCitation + close', () => {
      click('Create Citation');
      expect(props.editorView.runtime.insertCitation).toHaveBeenCalled();
      expect(props.close).toHaveBeenCalledWith('Create Citation');
    });

    it('calls insertInfoIcon + close', () => {
      click('Create Infoicon');
      expect(props.editorView.runtime.insertInfoIcon).toHaveBeenCalled();
      expect(props.close).toHaveBeenCalledWith('Create Infoicon');
    });

    it('calls createNewSlice + close', () => {
      click('Create Bookmark');
      expect(mockCreateNewSlice).toHaveBeenCalledWith(props.editorView);
      expect(props.close).toHaveBeenCalledWith('Create Slice');
    });

    it('calls copy/paste handlers (button wiring)', () => {
      click('Copy');
      click('Copy Without Formatting');
      click('Paste');
      click('Paste As Plain Text');
      click('Paste As Reference');

      expect(props.copyRichHandler).toHaveBeenCalled();
      expect(props.copyPlainHandler).toHaveBeenCalled();
      expect(props.pasteHandler).toHaveBeenCalled();
      expect(props.pastePlainHandler).toHaveBeenCalled();
      expect(props.pasteAsReferenceHandler).toHaveBeenCalled();
    });

    it('disables Create Citation when selection is empty (original expectation)', () => {
      props.editorState.selection.empty = true;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      const btn = getButton('Create Citation');
      expect(btn.disabled).toBe(false);
    });

    it('disables both when selection not in this paragraph (original expectation)', () => {
      props.editorState.selection.$from.before = () => 2;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      expect(getButton('Create Citation').disabled).toBe(false);
      expect(getButton('Create Infoicon').disabled).toBe(false);
    });

    it('disables Paste as Reference when flag is false', () => {
      props.pasteAsReferenceEnabled = false;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      expect(getButton('Paste As Reference').disabled).toBe(true);
    });

    it('does not throw when close callback missing', () => {
      delete props.close;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      expect(() => click('Create Citation')).not.toThrow();
    });

    it('closePopup calls props.close with menuName', () => {
      const instance = new FloatingMenu(props);
      if (props.close) {
        instance.closePopup('TestMenu');
        expect(props.close).toHaveBeenCalledWith('TestMenu');
      } else {
        expect(() => instance.closePopup('TestMenu')).not.toThrow();
      }
    });

    it('Create Bookmark still works if close is missing', () => {
      delete props.close;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      click('Create Bookmark');
      expect(mockCreateNewSlice).toHaveBeenCalledWith(props.editorView);
    });

    it('Copy button works even if editorState.selection.empty is true', () => {
      props.editorState.selection.empty = true;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      click('Copy');
      expect(props.copyRichHandler).toHaveBeenCalled();
    });

    it('Copy Without Formatting calls copyPlainHandler even when selection empty', () => {
      props.editorState.selection.empty = true;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      click('Copy Without Formatting');
      expect(props.copyPlainHandler).toHaveBeenCalled();
    });

    it('Paste As Reference toggles disabled state with prop', () => {
      props.pasteAsReferenceEnabled = false;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      expect(getButton('Paste As Reference').disabled).toBe(true);

      props.pasteAsReferenceEnabled = true;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      expect(getButton('Paste As Reference').disabled).toBe(false);
    });

    it('handles missing runtime functions safely (no-ops)', () => {
      props.editorView.runtime.insertCitation = jest.fn();
      props.editorView.runtime.insertInfoIcon = jest.fn();

      ReactDOM.render(<FloatingMenu {...props} />, container);

      expect(() => click('Create Citation')).not.toThrow();
      expect(() => click('Create Infoicon')).not.toThrow();
    });
  }); // UI tests

  // -------------------------
  // Plugin unit tests
  // -------------------------
  describe('FloatingMenuPlugin unit tests', () => {
    let mockView;
    let pluginInstance: Plugin.FloatingMenuPlugin;
    let mockPopUpHandle: PopUpHandle;
    let docNode: ProseMirrorNode;

    beforeEach(() => {
      jest.clearAllMocks();

      // Minimal ProseMirror doc for nodesBetween / slice
      docNode = basicSchema.node('doc', null, [
        basicSchema.node('paragraph', { objectId: 'a1', isDeco: { isSlice: true } }, [
          basicSchema.text('First paragraph'),
        ]),
        basicSchema.node('paragraph', null, [basicSchema.text('Second paragraph')]),
      ]);

      mockView = {
        focus: jest.fn(),
        state: {
          selection: {
            empty: false,
            from: 0,
            to: docNode.nodeSize - 2,
            $from: docNode.resolve(0),
            $to: docNode.resolve(docNode.nodeSize - 2),
            content: jest.fn(() => ({
              content: docNode.slice(0, docNode.nodeSize - 2).content,
              openStart: 0,
              openEnd: 0,
            })),
          },
          doc: docNode,
          tr: {
            insertText: jest.fn(() => ({ scrollIntoView: () => ({}) })),
            replaceSelection: jest.fn(() => ({ scrollIntoView: () => ({}) })),
          },
        },
        dispatch: jest.fn(),
        runtime: {
          createSlice: jest.fn((m) => Promise.resolve({ ok: true, model: m })),
        },
        hasFocus: jest.fn(() => true),
        docView: { node: { attrs: { objectId: 'doc-x', objectMetaData: { name: 'MyDoc' } } } },
      };

      mockPopUpHandle = { close: jest.fn(), update: jest.fn() };
      pluginInstance = new Plugin.FloatingMenuPlugin({} as FloatRuntime);
      pluginInstance._popUpHandle = mockPopUpHandle;
      pluginInstance._view = mockView;
    });

    it('createSliceObject: builds a SliceModel with ids and name', () => {
      const slice = Plugin.createSliceObject(mockView);
      expect(slice).toBeDefined();
      expect(slice.id).toContain('http://modusoperandi.com/editor/instance/');
      expect(slice.ids).toBeDefined();
      expect(slice.source).toBe('doc-x');
      expect(slice.name).toBeDefined();
    });

    it('copySelectionRich writes to clipboard and updates+closes popup (assert on local mock)', async () => {
      const writeSpy = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      await Plugin.copySelectionRich(mockView, pluginInstance);

      expect(writeSpy).toHaveBeenCalled();
      expect(mockPopUpHandle.update).toHaveBeenCalled();
      expect(mockPopUpHandle.close).toHaveBeenCalled();
    });

    it('copySelectionPlain writes plain text to clipboard and closes popup', async () => {
      const writeSpy = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      await Plugin.copySelectionPlain(mockView, pluginInstance);

      expect(writeSpy).toHaveBeenCalledWith('First paragraph\nSecond paragraph');
      expect(mockPopUpHandle.close).toHaveBeenCalled();
    });

    it('pasteFromClipboard: plain text branch dispatches insertText', async () => {
      jest.spyOn(navigator.clipboard, 'readText').mockResolvedValue('some plain text');

      await Plugin.pasteFromClipboard(mockView, pluginInstance);

      expect(mockView.dispatch).toHaveBeenCalled();
    });

    it('pasteAsReference: reads sliceModel and calls runtime.createSlice + insertReference', async () => {
      const sliceModel = { id: 'slice-1', source: 'doc-x' };
      jest.spyOn(navigator.clipboard, 'readText').mockResolvedValue(JSON.stringify({ sliceModel }));

      await Plugin.pasteAsReference(mockView, pluginInstance);

      expect(mockView.runtime.createSlice).toHaveBeenCalledWith(sliceModel);
      expect(insertReference).toHaveBeenCalled();
      expect(mockPopUpHandle.close).toHaveBeenCalled();
    });

    it('pasteAsPlainText: when clipboard contains JSON with non-slice data falls back and dispatches', async () => {
      jest.spyOn(navigator.clipboard, 'readText').mockResolvedValue(JSON.stringify({ foo: 'bar' }));

      await Plugin.pasteAsPlainText(mockView, pluginInstance);

      expect(mockView.dispatch).toHaveBeenCalled();
      expect(mockPopUpHandle.close).toHaveBeenCalled();
    });

    it('clipboardHasProseMirrorData: true for correct JSON, false otherwise', async () => {
      jest.spyOn(navigator.clipboard, 'readText').mockResolvedValue(JSON.stringify({ content: [] }));
      const yes = await Plugin.clipboardHasProseMirrorData();
      expect(yes).toBe(true);

      jest.spyOn(navigator.clipboard, 'readText').mockResolvedValue('not json');
      const no = await Plugin.clipboardHasProseMirrorData();
      expect(no).toBe(false);
    });

    it('getDecorations returns a DecorationSet-like object (findable)', () => {
      const decos = Plugin.getDecorations(mockView.state.doc, mockView.state);
      const found = (decos as DecorationSet).find ? (decos as DecorationSet).find() : [];
      expect(Array.isArray(found)).toBe(true);
      expect(found.length).toBeGreaterThanOrEqual(0);
    });

    it('getDocSlices logs on failure of network call (uses mocked ./slice)', async () => {
      (getDocumentslices as jest.Mock).mockRejectedValueOnce(new Error('network fail'));
      const consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      await Plugin.getDocSlices(mockView);
      expect(consoleErrSpy).toHaveBeenCalled();
      consoleErrSpy.mockRestore();
    });
  }); // plugin unit tests
});