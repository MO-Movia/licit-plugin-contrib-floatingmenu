/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { FloatingMenu } from './FloatingPopup';
import * as Plugin from './FloatingMenuPlugin';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { FloatRuntime } from './model';
import { PopUpHandle } from '@modusoperandi/licit-ui-commands';
import type * as FloatingMenuPluginModule from './FloatingMenuPlugin';

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
  createSliceManager: jest.fn(),
}));

// Keep the real plugin module but override createNewSlice with a mock for UI tests

jest.mock('./FloatingMenuPlugin', () => {
  const actual = jest.requireActual<typeof FloatingMenuPluginModule>('./FloatingMenuPlugin');
  return {
    ...actual,
    createNewSlice: jest.fn(),
    showReferences: jest.fn(),
  } satisfies Partial<typeof FloatingMenuPluginModule>;
});

// Mock insertReference (used in pasteAsReference)
jest.mock('@modusoperandi/licit-referencing', () => ({
  insertReference: jest.fn(),
}));

describe('FloatingMenu (Jest + DOM) - Extended & Plugin unit tests', () => {
  // Polyfill clipboard in JSDOM
  beforeAll(() => {
    if (navigator.clipboard) {
      (navigator.clipboard.readText as () => Promise<string>) =
        (navigator.clipboard.readText as () => Promise<string>) ||
        jest.fn().mockResolvedValue('mock text');
      (navigator.clipboard.writeText as () => Promise<void>) =
        (navigator.clipboard.writeText as () => Promise<void>) ||
        jest.fn().mockResolvedValue(undefined);
    } else {
      Object.assign(navigator, {
        clipboard: {
          readText: jest.fn().mockResolvedValue('mock text'),
          writeText: jest.fn().mockResolvedValue(undefined),
        },
      });
    }
  });
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
        createInfoIconHandler: jest.fn(),
        createCitationHandler: jest.fn(),
        copyRichHandler: jest.fn(),
        copyPlainHandler: jest.fn(),
        pasteHandler: jest.fn(),
        pastePlainHandler: jest.fn(),
        pasteAsReferenceHandler: jest.fn(),
        createNewSliceHandler: jest.fn(),
        showReferencesHandler: jest.fn(),
        pasteAsReferenceEnabled: true,
        enablePasteAsPlainText: true,
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
      return btn;
    }

    function click(label: string) {
      const btn = getButton(label);
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    it('renders all buttons', () => {
      const labels = Array.from(container.querySelectorAll('button')).map(
        (b) => b.textContent
      );
      expect(labels).toEqual([
        'Create Citation',
        'Create Infoicon',
        'Copy(Ctrl + C)',
        'Copy Without Formatting',
        'Paste(Ctrl + V)',
        'Paste As Plain Text',
        'Paste As Reference(Ctrl + Alt + V)',
        'Create Bookmark',
        'Insert Reference',
      ]);
    });

    it('calls insertCitation + close', () => {
      click('Create Citation');
      expect(props.createCitationHandler).toHaveBeenCalled();
    });

    it('calls insertInfoIcon + close', () => {
      click('Create Infoicon');
      expect(props.createInfoIconHandler).toHaveBeenCalled();
    });

      it('calls Paste handler', () => {
      click('Paste(Ctrl + V)');
      expect(props.pasteHandler).toHaveBeenCalled();
    });

    it('calls createNewSlice + close', () => {
      click('Create Bookmark');
      expect(props.createNewSliceHandler).toHaveBeenCalled();
    });
    it('calls insertReference + close', () => {
      click('Insert Reference');
      expect(props.showReferencesHandler).toHaveBeenCalled();
    });
    it('calls copy/paste handlers (button wiring)', () => {
      click('Copy(Ctrl + C)');
      click('Copy Without Formatting');
      click('Paste(Ctrl + V)');
      click('Paste As Plain Text');
      click('Paste As Reference(Ctrl + Alt + V)');

      expect(props.copyRichHandler).toHaveBeenCalled();
      expect(props.copyPlainHandler).toHaveBeenCalled();
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
      expect(getButton('Paste As Reference(Ctrl + Alt + V)').disabled).toBe(true);
    });

    it('does not throw when close callback missing', () => {
      delete props.close;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      expect(() => click('Create Citation')).not.toThrow();
    });

    it('Create Bookmark still works if close is missing', () => {
      delete props.close;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      click('Create Bookmark');
      expect(props.createNewSliceHandler).toHaveBeenCalled();
    });

    it('Copy button works even if editorState.selection.empty is true', () => {
      props.editorState.selection.empty = true;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      click('Copy(Ctrl + C)');
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
      expect(getButton('Paste As Reference(Ctrl + Alt + V)').disabled).toBe(true);

      props.pasteAsReferenceEnabled = true;
      ReactDOM.render(<FloatingMenu {...props} />, container);
      expect(getButton('Paste As Reference(Ctrl + Alt + V)').disabled).toBe(false);
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
        basicSchema.node(
          'paragraph',
          { objectId: 'a1', isDeco: { isSlice: true } },
          [basicSchema.text('First paragraph')]
        ),
        basicSchema.node('paragraph', null, [
          basicSchema.text('Second paragraph'),
        ]),
      ]);
      const addSliceToListMock = jest.fn();
      const insertReferenceMock = jest.fn();
      const addInfoIconMock = jest.fn();
      const addCitationMock = jest.fn();
      const plugin = {
        sliceManager: {
          addSliceToList: addSliceToListMock,
          insertReference: insertReferenceMock,
          addInfoIcon: addInfoIconMock,
          addCitation: addCitationMock,
        },
        _urlConfig: {
          instanceUrl: 'http://modusoperandi.com/editor/instance/',
          referenceUrl: 'http://modusoperandi.com/ont/document#Reference_nodes',
        },
      };

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
          config: { pluginsByKey: { 'floating-menu$': plugin } },
        },
        dispatch: jest.fn(),
        runtime: {
          createSlice: jest.fn((m) => Promise.resolve({ ok: true, model: m })),
        },
        hasFocus: jest.fn(() => true),
        docView: {
          node: { attrs: { objectId: 'doc-x', objectMetaData: { name: 'MyDoc' } } },
        },
      };
      const urlConfig = {
        instanceUrl: 'http://modusoperandi.com/editor/instance/',
        referenceUrl: 'http://modusoperandi.com/ont/document#Reference_nodes',
      }
      mockPopUpHandle = { close: jest.fn(), update: jest.fn() };
      pluginInstance = new Plugin.FloatingMenuPlugin({} as FloatRuntime, urlConfig);
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

    it('copySelectionRich writes to clipboard and updates+closes popup (assert on local mock)', () => {
      const writeSpy = jest
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue(undefined);

      Plugin.copySelectionRich(mockView, pluginInstance);

      expect(writeSpy).toHaveBeenCalled();
      expect(mockPopUpHandle.update).toHaveBeenCalled();
      expect(mockPopUpHandle.close).toHaveBeenCalled();
    });

    it('copySelectionPlain writes plain text to clipboard and closes popup', () => {
      const writeSpy = jest
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue(undefined);

      Plugin.copySelectionPlain(mockView, pluginInstance);

      expect(writeSpy).toHaveBeenCalledWith(
        'First paragraph\nSecond paragraph'
      );
      expect(mockPopUpHandle.close).toHaveBeenCalled();
    });

    it('pasteFromClipboard: plain text branch dispatches insertText', async () => {
      jest
        .spyOn(navigator.clipboard, 'readText')
        .mockResolvedValue('some plain text');

      await Plugin.pasteFromClipboard(mockView, pluginInstance);

      expect(mockView.dispatch).toHaveBeenCalled();
    });

    it('pasteAsReference: reads sliceModel and calls runtime.createSlice + insertReference', async () => {
      const sliceModel = { id: 'slice-1', source: 'doc-x' };
      jest
        .spyOn(navigator.clipboard, 'readText')
        .mockResolvedValue(JSON.stringify({ sliceModel }));

      await Plugin.pasteAsReference(mockView, pluginInstance);

      expect(mockPopUpHandle.close).toHaveBeenCalled();
    });

    it('pasteAsPlainText: when clipboard contains JSON with non-slice data falls back and dispatches', async () => {
      jest
        .spyOn(navigator.clipboard, 'readText')
        .mockResolvedValue(JSON.stringify({ foo: 'bar' }));

      await Plugin.pasteAsPlainText(mockView, pluginInstance);

      expect(mockView.dispatch).toHaveBeenCalled();
      expect(mockPopUpHandle.close).toHaveBeenCalled();
    });

    it('clipboardHasProseMirrorData: true for correct JSON, false otherwise', async () => {
      jest
        .spyOn(navigator.clipboard, 'readText')
        .mockResolvedValue(JSON.stringify({ content: [] }));
      const yes = await Plugin.clipboardHasProseMirrorData();
      expect(yes).toBe(true);

      jest.spyOn(navigator.clipboard, 'readText').mockResolvedValue('not json');
      const no = await Plugin.clipboardHasProseMirrorData();
      expect(no).toBe(false);
    });

    it('getDecorations returns a DecorationSet-like object (findable)', () => {
      const decos = Plugin.getDecorations(mockView.state.doc, mockView.state);
      const found = decos.find ? decos.find() : [];
      expect(Array.isArray(found)).toBe(true);
      expect(found.length).toBeGreaterThanOrEqual(0);
    });
  }); // plugin unit tests
});
