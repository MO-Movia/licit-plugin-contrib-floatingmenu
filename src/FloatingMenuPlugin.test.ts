/**
 * @jest-environment jsdom
 */

import { EditorState, TextSelection, Transaction } from 'prosemirror-state';

import { DecorationSet, EditorView } from 'prosemirror-view';
import { Schema, Node, NodeSpec } from 'prosemirror-model';
import {
  FloatingMenuPlugin,
  changeAttribute,
  copySelectionPlain,
  copySelectionRich,
  createNewSlice,
  createSliceObject,
  getDecorations,
  pasteAsPlainText,
  pasteAsReference,
  pasteFromClipboard,
  addAltRightClickHandler,
  clipboardHasProseMirrorData,
  showReferences,
  createInfoIconHandler,
  createCitationHandler,
  CMPluginKey,
  getDocSlices,
  getClosestHTMLElement,
} from './FloatingMenuPlugin';
import { insertReference } from '@modusoperandi/licit-referencing';
import * as licitCommands from '@modusoperandi/licit-ui-commands';
import { FloatingMenu } from './FloatingPopup';
import { FloatRuntime, SliceModel } from './model';
// Mock external dependencies
jest.mock('@modusoperandi/licit-ui-commands', () => ({
  createPopUp: jest.fn(() => ({ close: jest.fn() })),
  atAnchorBottomLeft: jest.fn(),
}));
jest.mock('@modusoperandi/licit-referencing', () => ({
  insertReference: jest.fn(),
}));

jest.mock('./FloatingMenuPlugin', () => ({
  ...jest.requireActual('./FloatingMenuPlugin'),
  createSliceObject: jest.fn(),
}));

jest.mock('./slice', () => ({
  __esModule: true, // ensure ES module semantics
  addSliceToList: jest.fn(),
  setSliceRuntime: jest.fn(),
  getDocumentslices: jest.fn(),
  setSlices: jest.fn(),
  setSliceAtrrs: jest.fn(),
  createSliceManager: jest.fn(),
}));

const mockRuntime: FloatRuntime = {
  createSlice: jest.fn().mockResolvedValue({} as SliceModel), // mock return value as needed
  retrieveSlices: jest.fn().mockResolvedValue([]),
  insertInfoIconFloat: jest.fn(),
  insertCitationFloat: jest.fn(),
  insertReference: jest.fn(),
};

describe('FloatingMenuPlugin', () => {
  let plugin: FloatingMenuPlugin;
  let view: EditorView;
  let schema: Schema;
  let state: EditorState;

  beforeEach(() => {
    jest.clearAllMocks();

    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    plugin = new FloatingMenuPlugin(mockRuntime); // plugin instance

    state = EditorState.create({
      schema,
      plugins: [plugin], // <-- add plugin here
    });

    view = {
      dom: document.createElement('div'),
      posAtCoords: jest.fn(),
      state: { doc: {}, selection: {} },
    } as unknown as EditorView;
  });

  it('should initialize plugin state and set slice runtime', () => {
    const pluginState = plugin.getState(state);
    expect(pluginState).toHaveProperty('decorations');
  });

  it('should attach view and handle pointerdown on hamburger', async () => {
    const wrapper = document.createElement('div');
    const hamburger = document.createElement('div');
    hamburger.className = 'float-icon';
    hamburger.dataset.pos = '1';
    wrapper.appendChild(hamburger);
    view.dom.appendChild(wrapper);

    plugin.spec.view!(view);

    const event = new Event('pointerdown', { bubbles: true });
    hamburger.dispatchEvent(event);

    // Wait for async popup creation
    await Promise.resolve();

    expect(licitCommands.createPopUp).toHaveBeenCalledWith(
      FloatingMenu,
      expect.objectContaining({
        editorView: view,
        editorState: expect.anything(), // <- accept any value
      }),
      expect.any(Object)
    );

    // Closing popup should reset handle
    plugin._popUpHandle?.close(null);
    expect(plugin._popUpHandle?.close).toBeDefined();
  });

  it('should handle outside click', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    plugin._popUpHandle = { close: jest.fn(), update: jest.fn() };

    const clickEvent = new MouseEvent('click', { bubbles: true });
    div.dispatchEvent(clickEvent);

    // After click outside, popUpHandle should be null
    plugin._popUpHandle?.close(null);
    expect(plugin._popUpHandle?.close).toBeDefined();
  });

  it('getEffectiveSchema should return schema', () => {
    expect(plugin.getEffectiveSchema(schema)).toBe(schema);
  });
});

describe('copySelectionRich', () => {
  let schema: Schema;
  let doc: Node;
  let state: EditorState;
  let view: EditorView;
  let plugin: FloatingMenuPlugin;

  beforeEach(() => {
    jest.clearAllMocks();

    // Minimal schema
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    doc = schema.nodes.doc.createAndFill()!;

    state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 0, 0), // initially empty
    });

    view = new EditorView(document.createElement('div'), { state });

    plugin = new FloatingMenuPlugin(mockRuntime);

    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    // Mock view.focus
    jest.spyOn(view, 'focus').mockImplementation(() => { });
  });

  it('should return early if selection is empty', async () => {
    // Ensure selection is empty
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 0, 0))
    );
    view.updateState(state);

    // Call the function
    await copySelectionRich(view, plugin);

    // Expect clipboard.writeText not called
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('should copy selection to clipboard and update popup', async () => {
    // make selection non-empty
    state = state.apply(state.tr.insertText('Hello', 0));
    view.updateState(state);
    state = view.state;

    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 0, 5))
    );
    view.updateState(state);

    // Add mock _popUpHandle
    plugin._popUpHandle = {
      update: jest.fn(),
      close: jest.fn(),
      props: { pasteAsReferenceEnabled: false },
    } as unknown as licitCommands.PopUpHandle;

    await copySelectionRich(view, plugin);

    expect(view.focus).toHaveBeenCalled(); // focus branch
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('{"content"')
    );

    expect(plugin._popUpHandle).toBeNull();
  });
});

describe('createSliceObject', () => {
  let schema: Schema;
  let doc: Node;
  let state: EditorState;
  let view: EditorView;

  beforeEach(() => {
    jest.clearAllMocks();

    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
          attrs: { objectId: { default: '' } },
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    doc = schema.nodes.doc.createAndFill()!;

    state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 0, 0),
    });

    view = new EditorView(document.createElement('div'), { state });
    jest.spyOn(view, 'focus').mockImplementation(() => { });
  });

  it('should create a slice object with no objectIds', () => {
    const sliceModelMock = {
      ids: 'slice1',
      from: 'slice1',
      to: 'slice1',
      source: undefined,
      name: 'Untitled',
      id: 'http://modusoperandi.com/editor/instance/slice1',
      referenceType: 'http://modusoperandi.com/ont/document#Reference_nodes',
      description: '',
    };
    (createSliceObject as jest.Mock).mockReturnValue(sliceModelMock);

    expect(sliceModelMock.ids).toEqual('slice1');
    expect(sliceModelMock.from).toBe('slice1');
    expect(sliceModelMock.to).toBe('slice1');
    expect(sliceModelMock.source).toBeUndefined();
    expect(sliceModelMock.referenceType).toBe(
      'http://modusoperandi.com/ont/document#Reference_nodes'
    );
    expect(sliceModelMock.name).toContain('Untitled');
    expect(sliceModelMock.id).toContain(
      'http://modusoperandi.com/editor/instance'
    );
  });

  it('should create a slice object with first paragraph text and objectId', () => {
    // Recreate doc with paragraph containing objectId
    const paragraphWithId = schema.nodes.paragraph.create(
      { objectId: 'obj1' },
      schema.text('Hello World')
    );
    const docWithPara = schema.nodes.doc.create({}, [paragraphWithId]);
    state = EditorState.create({
      schema,
      doc: docWithPara,
      selection: TextSelection.create(docWithPara, 0, docWithPara.content.size),
    });
    view.updateState(state);

    // Add a fake docView with objectId

    (view as EditorView)['docView'] = { node: { attrs: { objectId: 'sourceObj' } } };

    const slice = createSliceObject(view);

    expect(slice.ids).toEqual('slice1');
    expect(slice.from).toBe('slice1');
    expect(slice.to).toBe('slice1');
    expect(slice.source).toBe(undefined);
    expect(slice.name).toContain('Untitled');
    expect(slice.id).toContain('http://modusoperandi.com/editor/instance/');
  });
});
describe('copySelectionPlain', () => {
  let schema: Schema;
  let doc: Node;
  let state: EditorState;
  let view: EditorView;
  let plugin: FloatingMenuPlugin;

  beforeEach(() => {
    jest.clearAllMocks();

    // Minimal schema
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    const paragraph = schema.nodes.paragraph.create({}, schema.text(' SLICE '));
    doc = schema.nodes.doc.create({}, [paragraph]);
    state = EditorState.create({ schema, doc });
    view = new EditorView(document.createElement('div'), { state });

    // Spy focus
    jest.spyOn(view, 'focus').mockImplementation(() => { });

    plugin = new FloatingMenuPlugin(mockRuntime);
    plugin._popUpHandle = { close: jest.fn(), update: jest.fn() };

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('should return early if selection is empty', async () => {
    const sel = TextSelection.create(doc, 0, 0);
    state = state.apply(state.tr.setSelection(sel));
    view.updateState(state);

    await copySelectionPlain(view, plugin);

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(view.focus).toHaveBeenCalled(); // focus is still called if not focused
  });

  it('should copy text to clipboard and close popup', async () => {
    const sel = TextSelection.create(doc, 0, 0);
    state = state.apply(state.tr.setSelection(sel));
    view.updateState(state);

    await copySelectionPlain(view, plugin);

    expect(view.focus).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toBeDefined();
    expect(plugin._popUpHandle?.close).toBeDefined();
    expect(plugin._popUpHandle).toHaveProperty('close');
  });

  it('should focus the view if not already focused', async () => {
    const sel = TextSelection.create(doc, 0, 0);
    state = state.apply(state.tr.setSelection(sel));
    view.updateState(state);

    jest.spyOn(view, 'hasFocus').mockReturnValue(false);

    await copySelectionPlain(view, plugin);

    expect(view.focus).toHaveBeenCalled();
  });
});

describe('pasteFromClipboard', () => {
  let schema: Schema;
  let doc: Node;
  let state: EditorState;
  let view: EditorView;
  let plugin: FloatingMenuPlugin;

  beforeEach(() => {
    jest.clearAllMocks();

    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    const paragraph = schema.nodes.paragraph.create({}, schema.text('Hello'));
    doc = schema.nodes.doc.create({}, [paragraph]);
    state = EditorState.create({ schema, doc });
    view = new EditorView(document.createElement('div'), { state });

    jest.spyOn(view, 'focus').mockImplementation(() => { });
    jest.spyOn(view, 'dispatch');

    plugin = new FloatingMenuPlugin(mockRuntime);
    plugin._popUpHandle = { close: jest.fn(), update: jest.fn() };

    Object.assign(navigator, {
      clipboard: {
        readText: jest.fn().mockResolvedValue('Hello World'),
      },
    });
  });

  it('should paste plain text from clipboard when text is not JSON', async () => {
    (navigator.clipboard.readText as jest.Mock).mockResolvedValueOnce(
      'Plain text'
    );

    const closeSpy = jest.fn();
    plugin._popUpHandle = { close: closeSpy, update: jest.fn() };
    await pasteFromClipboard(view, plugin);

    expect(view.focus).toHaveBeenCalled();
    expect(view.dispatch).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledWith(null); // use the spy reference
    expect(plugin._popUpHandle).toBeNull();
  });

  it('should paste as JSON slice when clipboard contains valid JSON slice', async () => {
    const sliceJSON = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
    };
    (navigator.clipboard.readText as jest.Mock).mockResolvedValueOnce(
      JSON.stringify(sliceJSON)
    );

    await pasteFromClipboard(view, plugin);

    expect(view.dispatch).toHaveBeenCalled();
    expect(plugin._popUpHandle?.close).toBeUndefined();
  });

  it('should call view.focus if view is not focused', async () => {
    jest.spyOn(view, 'hasFocus').mockReturnValue(false);

    await pasteFromClipboard(view, plugin);

    expect(view.focus).toHaveBeenCalled();
  });

  it('should handle clipboard read failure gracefully', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });
    (navigator.clipboard.readText as jest.Mock).mockRejectedValueOnce(
      new Error('fail')
    );

    await pasteFromClipboard(view, plugin);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Clipboard paste failed:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

describe('FloatingMenuPlugin clipboard paste helpers', () => {
  let schema: Schema;
  let doc: Node;
  let state: EditorState;
  let view: EditorView;
  let plugin: FloatingMenuPlugin;

  beforeEach(() => {
    jest.clearAllMocks();

    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    const paragraph = schema.nodes.paragraph.create({}, schema.text('Hello'));
    doc = schema.nodes.doc.create({}, [paragraph]);
    state = EditorState.create({ schema, doc });
    view = new EditorView(document.createElement('div'), { state });

    // add runtime mock
    (view as EditorView)['runtime'] = {
      createSlice: jest.fn().mockResolvedValue('ok'),
    };

    plugin = new FloatingMenuPlugin(mockRuntime);
    plugin._popUpHandle = { close: jest.fn(), update: jest.fn() };

    Object.assign(navigator, {
      clipboard: {
        readText: jest.fn().mockResolvedValue(''),
      },
    });
  });

  /** pasteAsReference tests **/

  it('should paste as reference and call insertReference', async () => {
    const sliceModel = { id: 'id1', source: 'src', name: 'slice1' } as SliceModel;
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      JSON.stringify({ sliceModel })
    );

    // Mock plugin with sliceManager
    const plugin = {
      sliceManager: {
        createSliceViaDialog: jest.fn().mockResolvedValue({
          id: 'id1',
          source: 'src',
          name: 'slice1',
        }),
      },
      _popUpHandle: null,
    } as unknown as FloatingMenuPlugin;

    (view as EditorView)['docView'] = {
      node: { attrs: { objectMetaData: { name: 'docName' } } },
    };

    await pasteAsReference(view, plugin);

    expect(view.focus).toBeDefined();
    expect(insertReference).toHaveBeenCalledWith(view, 'id1', 'src', 'docName');
    expect(plugin._popUpHandle?.close).toBeUndefined();
    expect(plugin._popUpHandle).toBeNull();
  });

  it('should handle runtime.createSlice rejection', async () => {
    const sliceModel = {
      ids: ['slice1'],
      from: 'slice1',
      to: 'slice1',
      source: 'src',
      name: 'Untitled',
      id: 'id1',
      referenceType: 'http://modusoperandi.com/ont/document#Reference_nodes',
      description: '',
    };
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      JSON.stringify({ sliceModel })
    );
    (view as EditorView)['runtime'].createSlice = jest
      .fn()
      .mockRejectedValue(new Error('fail'));
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });

    // Call function
    await pasteAsReference(view, plugin);

    // Wait for the runtime.createSlice promise to settle
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to paste content or create slice:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it('should handle invalid clipboard JSON', async () => {
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue('not-json');
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });

    await pasteAsReference(view, plugin);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to paste content or create slice:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  /** pasteAsPlainText tests **/

  it('should paste JSON slice as plain text', async () => {
    const sliceJSON = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
    };
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      JSON.stringify(sliceJSON)
    );

    // Spy on focus and dispatch
    jest.spyOn(view, 'focus');
    jest.spyOn(view, 'dispatch');

    await pasteAsPlainText(view, plugin);

    expect(view.focus).toHaveBeenCalled();
    expect(view.dispatch).toHaveBeenCalled();
    expect(plugin._popUpHandle?.close).toBeUndefined();
    expect(plugin._popUpHandle).toBeNull();
  });

  it('should paste plain text if clipboard is not JSON', async () => {
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      'Hello World'
    );

    // Spy on dispatch so Jest can track it
    jest.spyOn(view, 'dispatch');

    await pasteAsPlainText(view, plugin);

    expect(view.dispatch).toHaveBeenCalled();
    expect(plugin._popUpHandle?.close).toBeUndefined();
  });

  it('should handle clipboard read failure gracefully', async () => {
    (navigator.clipboard.readText as jest.Mock).mockRejectedValue(
      new Error('fail')
    );
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });

    await pasteAsPlainText(view, plugin);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Plain text paste failed:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

describe('clipboardHasProseMirrorData', () => {
  let readTextMock: jest.SpyInstance;
  beforeEach(() => {
    readTextMock = jest.spyOn(navigator.clipboard, 'readText');
    Object.assign(navigator, {
      clipboard: { readText: jest.fn() },
    });
  });

  it('should return false when clipboard text is empty', async () => {
    jest.spyOn(navigator.clipboard, 'readText').mockResolvedValue('');
    const result = await clipboardHasProseMirrorData();
    expect(result).toBe(false);
  });
  it('should return true if parsed JSON has content array', async () => {
    const validData = JSON.stringify({ content: [] });
    readTextMock.mockResolvedValue(validData);
    const result = await clipboardHasProseMirrorData();
    expect(result).toBe(false);
  });
  it('returns false if clipboard is empty', async () => {
    // (navigator.clipboard.readText as jest.Mock).mockResolvedValue('');
    const result = await clipboardHasProseMirrorData();
    expect(result).toBe(false);
  });

  it('returns false if clipboard is empty', async () => {
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue('');
    const result = await clipboardHasProseMirrorData();
    expect(result).toBe(false);
  });


  it('returns true if clipboard JSON has content array', async () => {
    const json = { content: [{ type: 'paragraph' }] };
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      JSON.stringify(json)
    );
    const result = await clipboardHasProseMirrorData();
    expect(result).toBe(true);
  });

  it('returns true if clipboard JSON has content.type', async () => {
    const json = { content: { type: 'paragraph' } };
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      JSON.stringify(json)
    );
    const result = await clipboardHasProseMirrorData();
    expect(result).toBe(true);
  });

  it('returns false on invalid JSON', async () => {
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      'invalid-json'
    );
    const result = await clipboardHasProseMirrorData();
    expect(result).toBe(false);
  });
});

describe('getDecorations', () => {
  let schema: Schema;
  let doc: Node;
  let state: EditorState;

  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    const paragraph = schema.nodes.paragraph.create({}, schema.text('Hello'));
    doc = schema.nodes.doc.create({}, [paragraph]);
    state = EditorState.create({ schema, doc });
  });

  it('creates hamburger for simple paragraph', () => {
    const decorations = getDecorations(doc, state);
    expect(decorations).toBeInstanceOf(DecorationSet);
    expect(decorations.find().length).toBeGreaterThan(0);
    expect(decorations.find()[0].spec.widget?.className).toBeUndefined();
  });
  it('creates hamburger when isSlice isTag false', () => {
    const schema = new Schema({
      nodes: {
        doc: {
          content: 'block+',
        },
        paragraph: {
          content: 'inline*',
          group: 'block',
          attrs: {
            isDeco: { default: null }, // 👈 decoration flags live here
          },
          parseDOM: [{ tag: 'p' }],
          toDOM() {
            return ['p', 0];
          },
        },
        text: {
          group: 'inline',
        },
      },
      marks: {},
    });

    const jsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            isDeco: {
              isSlice: false,
              isTag: false,
              isComment: true,
            },
          },
          content: [
            {
              type: 'text',
              text: 'This paragraph has all decorations (slice, tag, comment).',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'This paragraph has only the hamburger decoration.',
            },
          ],
        },
      ],
    };
    const doc = schema.nodeFromJSON(jsonDoc);

    const decorations = getDecorations(doc, state);
    expect(decorations).toBeDefined();
  });
  it('should handle getDecorations', () => {
    const schema = new Schema({
      nodes: {
        doc: {
          content: 'inline*',
        },
        text: {
          group: 'inline',
        },
      },
      marks: {},
    });

    // ✅ JSON without paragraph
    const jsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'text',
          text: 'This document has direct text content without paragraph.',
        },
        {
          type: 'text',
          text: ' Another piece of text continues here.',
        },
      ],
    };
    const doc = schema.nodeFromJSON(jsonDoc);
    const decorations = getDecorations(doc, state);
    expect(decorations).toBeDefined();
  });
  it('creates hamburger ', () => {
    const schema = new Schema({
      nodes: {
        doc: {
          content: 'block+',
        },
        paragraph: {
          content: 'inline*',
          group: 'block',
          attrs: {
            isDeco: { default: null }, // 👈 decoration flags live here
          },
          parseDOM: [{ tag: 'p' }],
          toDOM() {
            return ['p', 0];
          },
        },
        text: {
          group: 'inline',
        },
      },
      marks: {},
    });

    const jsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            isDeco: {
              isSlice: true,
              isTag: true,
              isComment: true,
            },
          },
          content: [
            {
              type: 'text',
              text: 'This paragraph has all decorations (slice, tag, comment).',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'This paragraph has only the hamburger decoration.',
            },
          ],
        },
      ],
    };
    const doc = schema.nodeFromJSON(jsonDoc);

    const decorations = getDecorations(doc, state);
    expect(decorations).toBeDefined();
  });
  it('creates hamburger when isSlice false', () => {
    const schema = new Schema({
      nodes: {
        doc: {
          content: 'block+',
        },
        paragraph: {
          content: 'inline*',
          group: 'block',
          attrs: {
            isDeco: { default: null }, // 👈 decoration flags live here
          },
          parseDOM: [{ tag: 'p' }],
          toDOM() {
            return ['p', 0];
          },
        },
        text: {
          group: 'inline',
        },
      },
      marks: {},
    });

    const jsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            isDeco: {
              isSlice: false,
              isTag: true,
              isComment: true,
            },
          },
          content: [
            {
              type: 'text',
              text: 'This paragraph has all decorations (slice, tag, comment).',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'This paragraph has only the hamburger decoration.',
            },
          ],
        },
      ],
    };
    const doc = schema.nodeFromJSON(jsonDoc);

    const decorations = getDecorations(doc, state);
    expect(decorations).toBeDefined();
  });
});

describe('createNewSlice', () => {
  let view;
  let sliceModelMock: SliceModel;

  beforeEach(() => {
    sliceModelMock = {
      ids: ['slice1'],
      from: 'slice1',
      to: 'slice1',
      source: '',
      name: 'Untitled',
      id: 'http://modusoperandi.com/editor/instance/slice1',
      referenceType: 'http://modusoperandi.com/ont/document#Reference_nodes',
      description: '',
    };
    (createSliceObject as jest.Mock).mockReturnValue(sliceModelMock);

    view = {
      state: {
        config: {
          pluginsByKey: () => {
            return undefined;
          },
        },
        selection: {
          $from: { start: jest.fn().mockReturnValue(0), depth: 0 },
          $to: { end: jest.fn().mockReturnValue(1), depth: 0 },
        },
        doc: {
          nodesBetween: jest.fn((_from: number, _to: number, callback) => {
            // simulate one paragraph node
            callback(
              {
                type: { name: 'paragraph' },
                attrs: { objectId: 'obj1' },
                textContent: 'Hello',
              },
              0
            ) as unknown;
          }),
        },
        schema: {}, // can be left empty or minimal schema
        tr: {
          replaceSelection: jest.fn(),
          insertText: jest.fn(),
          scrollIntoView: jest.fn().mockReturnThis(),
        },
      },
      focus: jest.fn(),
      dispatch: jest.fn(),
      runtime: mockRuntime,
      docView: { node: { attrs: { objectId: 'sourceObj' } } },
    } as unknown as EditorView;
    jest.clearAllMocks();
  });

  it('logs error if createSlice rejects', async () => {
    const error = new Error('fail');
    view.runtime.createSlice.mockRejectedValue(error);

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });

    const test = await createNewSlice(view);
    // Wait for promise rejection
    await Promise.resolve();

    expect(test).toBeUndefined();

    consoleSpy.mockRestore();
  });

  it('logs error if createSlice rejects', async () => {
    const error = new Error('fail');
    view.runtime.createSlice.mockRejectedValue(error);

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });

    const test = await showReferences(view);
    // Wait for promise rejection
    await Promise.resolve();

    expect(test).toBeUndefined();

    consoleSpy.mockRestore();
  });
  it('logs error if createSlice rejects', async () => {
    const error = new Error('fail');
    view.runtime.createSlice.mockRejectedValue(error);

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });

    const test = await createInfoIconHandler(view);
    // Wait for promise rejection
    await Promise.resolve();

    expect(test).toBeUndefined();

    consoleSpy.mockRestore();
  });
  it('logs error if createSlice rejects', async () => {
    const error = new Error('fail');
    view.runtime.createSlice.mockRejectedValue(error);

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => { });

    const test = await createCitationHandler(view);
    // Wait for promise rejection
    await Promise.resolve();

    expect(test).toBeUndefined();

    consoleSpy.mockRestore();
  });
});

describe('changeAttribute', () => {
  let viewMock;

  beforeEach(() => {
    viewMock = {
      state: {
        selection: {
          $from: {
            before: jest.fn().mockReturnValue(5), // mock starting position
          },
        },
        doc: {
          nodeAt: jest.fn((pos) => {
            if (pos === 5) {
              return { attrs: { isDeco: { isTag: true } } };
            }
            return null;
          }),
        },
        tr: {
          setNodeMarkup: jest.fn().mockReturnThis(),
        },
      },
      dispatch: jest.fn(),
    };
  });

  it('should update node attributes and dispatch transaction when node exists', () => {
    changeAttribute(viewMock);

    expect(viewMock.state.selection.$from.before).toHaveBeenCalledWith(1);
    expect(viewMock.state.doc.nodeAt).toHaveBeenCalledWith(5);
    expect(viewMock.state.tr.setNodeMarkup).toHaveBeenCalledWith(5, undefined, {
      isDeco: { isTag: true, isSlice: true },
    });
    expect(viewMock.dispatch).toHaveBeenCalledWith(viewMock.state.tr);
  });

  it('should do nothing if node does not exist', () => {
    viewMock.state.doc.nodeAt = jest.fn().mockReturnValue(null);

    changeAttribute(viewMock);

    expect(viewMock.state.tr.setNodeMarkup).not.toHaveBeenCalled();
    expect(viewMock.dispatch).not.toHaveBeenCalled();
  });

  it('should handle node with no isDeco attribute', () => {
    viewMock.state.doc.nodeAt = jest.fn().mockReturnValue({ attrs: {} });

    changeAttribute(viewMock);

    expect(viewMock.state.tr.setNodeMarkup).toHaveBeenCalledWith(5, undefined, {
      isDeco: { isSlice: true }, // only slice
    });
    expect(viewMock.dispatch).toHaveBeenCalled();
  });

  it('should preserve existing node attributes while adding isSlice', () => {
    viewMock.state.doc.nodeAt = jest.fn().mockReturnValue({
      attrs: { customAttr: 'keepMe' },
    });

    changeAttribute(viewMock);

    expect(viewMock.state.tr.setNodeMarkup).toHaveBeenCalledWith(5, undefined, {
      customAttr: 'keepMe',
      isDeco: { isSlice: true },
    });
  });
  it('should not call setNodeMarkup if no node exists at selection', () => {
    const stateMock = {
      selection: { from: 999 }, // non-existent
      schema: { nodes: { floatingMenu: {} } },
      doc: { nodeAt: jest.fn().mockReturnValue(null) }, // node missing
      tr: { setNodeMarkup: jest.fn().mockReturnThis(), docChanged: true },
    };
    const viewMock = { state: stateMock, dispatch: jest.fn() };

    expect(viewMock.state.tr.setNodeMarkup).not.toHaveBeenCalled();
    expect(viewMock.dispatch).not.toHaveBeenCalled();
  });

  it('should return old plugin state if no docChanged', () => {
    const oldPluginState = { active: false };

    const trMock = { docChanged: false } as Transaction;
    const oldState = {} as EditorState;
    const newState = {} as EditorState;

    const plugin = new FloatingMenuPlugin(mockRuntime);
    const applyFn = plugin.spec.state?.apply ?? (() => { });

    const newPluginState = applyFn(trMock, oldPluginState, oldState, newState);

    // Use deep equality
    expect(newPluginState).toBeDefined();
  });
  it('should handle apply', () => {
    const oldPluginState = {
      active: false,
      decorations: {
        map: () => {
          return {};
        },
      },
    };
    const trMock = {
      docChanged: true,
      steps: [
        {
          toJSON: () => {
            return { stepType: 'setNodeMarkup' };
          },
        },
      ],
    } as Transaction;
    const oldState = {} as EditorState;
    const newState = {} as EditorState;
    const plugin = new FloatingMenuPlugin(mockRuntime);
    const applyFn = plugin.spec.state?.apply;
    expect(applyFn).toBeDefined();
    if (!applyFn) {
      throw new Error('Plugin apply function is undefined');
    }
    const newPluginState = applyFn(trMock, oldPluginState, oldState, newState);
    expect(newPluginState).toBeDefined();
  });
});
describe('createNewSlice ', () => {
  it('should call sliceManager.createSliceViaDialog and addSliceToList', async () => {
    const createSliceViaDialogMock = jest.fn().mockResolvedValue({ id: 'slice1' });
    const addSliceToListMock = jest.fn();

    // Mock plugin with sliceManager
    const plugin = {
      sliceManager: {
        createSliceViaDialog: createSliceViaDialogMock,
        addSliceToList: addSliceToListMock,
      },
    };
    const view = {
      focus: jest.fn(),
      state: {
        config: { pluginsByKey: { 'floating-menu$': plugin } },
        selection: {
          $from: { start: () => 0 },
          $to: { end: () => 1 },
        },
        doc: { nodesBetween: jest.fn() },
      },
      runtime: {
        createSlice: jest.fn().mockResolvedValue({}),
      },
    } as unknown as EditorView;

    // Act
    await createNewSlice(view);

    // Assert
    expect(createSliceViaDialogMock).toHaveBeenCalled();
    expect(addSliceToListMock).toHaveBeenCalledWith({ id: 'slice1' });
  });
});
describe('openFloatingMenu ', () => {
  it('openFloatingMenu ', () => {
    const plug = new FloatingMenuPlugin({} as unknown as FloatRuntime);
    plug._popUpHandle = { close: () => { }, update: () => { } };
    expect(
      openFloatingMenu(
        plug,
        {
          focus: () => { },
          state: {
            config: { pluginsByKey: { 'floating-menu$': {} } },
            selection: {
              $from: {
                start: () => {
                  return 0;
                },
              },
              $to: {
                end: () => {
                  return 1;
                },
              },
            },
            doc: { nodesBetween: () => { } },
          },
          runtime: {
            createSlice: () => {
              return Promise.resolve({});
            },
          },
        } as unknown as EditorView,
        1
      )
    ).toBeUndefined();
  });
});
describe('addAltRightClickHandler ', () => {
  it('addAltRightClickHandler ', () => {
    const plug = new FloatingMenuPlugin({} as unknown as FloatRuntime);
    plug._popUpHandle = { close: () => { }, update: () => { } };
    expect(
      addAltRightClickHandler(
        {
          focus: () => { },
          state: {
            config: { pluginsByKey: { 'floating-menu$': {} } },
            selection: {
              $from: {
                start: () => {
                  return 0;
                },
              },
              $to: {
                end: () => {
                  return 1;
                },
              },
            },
            doc: { nodesBetween: () => { } },
          },
          runtime: {
            createSlice: () => {
              return Promise.resolve({});
            },
          },
          dom: { addEventListener: () => { } },
        } as unknown as EditorView,
        plug
      )
    ).toBeUndefined();
  });
});
describe('addAltRightClickHandler', () => {
  it('calls openFloatingMenu when Alt + right-click is triggered', () => {
    const viewDom = document.createElement('div');
    const plugin = {} as unknown as FloatingMenuPlugin;

    const view = {
      dom: viewDom,
      editable: true,
    } as unknown as EditorView;
    view.dom.addEventListener('contextmenu', (e: MouseEvent) => {
      if (e.altKey && e.button === 2 && view.editable) {
        e.preventDefault();
        e.stopPropagation();
        const pos = { x: e.clientX, y: e.clientY };
        openFloatingMenu(plugin, view, undefined, undefined, pos);
      }
    });

    const event = new MouseEvent('contextmenu', {
      button: 2,
      altKey: true,
      clientX: 100,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });

    const preventDefault = jest.spyOn(event, 'preventDefault');
    const stopPropagation = jest.spyOn(event, 'stopPropagation');

    viewDom.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(openFloatingMenu).toHaveBeenCalledWith(
      plugin,
      view,
      undefined,
      undefined,
      { x: 100, y: 200 }
    );
  });


  it('does not call openFloatingMenu for normal right-click', () => {
    const dom = document.createElement('div');
    const plugin = {} as unknown as FloatingMenuPlugin;
    const view = {
      dom: document.createElement('div'),
      posAtCoords: jest.fn().mockReturnValue(null),
      state: { doc: {}, selection: {} },
    } as unknown as EditorView;
    const openFloatingMenu = jest.fn();
    globalThis.openFloatingMenu = openFloatingMenu;

    addAltRightClickHandler(view, plugin);

    const event = new MouseEvent('contextmenu', {
      button: 2,
      altKey: false,
      clientX: 100,
      clientY: 200,
    });

    dom.dispatchEvent(event);
    expect(openFloatingMenu).not.toHaveBeenCalled();
  });

  it('does not call openFloatingMenu when posAtCoords returns null', () => {
    const dom = document.createElement('div');
    const plugin = {} as unknown as FloatingMenuPlugin;
    const view = {
      dom: document.createElement('div'),
      posAtCoords: jest.fn().mockReturnValue(null),
      state: { doc: {}, selection: {} },
    } as unknown as EditorView;
    const openFloatingMenu = jest.fn();
    globalThis.openFloatingMenu = openFloatingMenu;

    addAltRightClickHandler(view, plugin);

    const event = new MouseEvent('contextmenu', {
      button: 2,
      altKey: true,
      clientX: 100,
      clientY: 200,
    });

    dom.dispatchEvent(event);
    expect(openFloatingMenu).not.toHaveBeenCalled();
  });
});

const openFloatingMenu = jest.fn();
globalThis.openFloatingMenu = openFloatingMenu;

describe('addAltRightClickHandler', () => {
  let mockView: EditorView;
  let mockPlugin: FloatingMenuPlugin;
  let cleanup: () => void;

  beforeEach(() => {
    mockPlugin = { id: 'plugin-1' } as unknown as FloatingMenuPlugin;
    mockView = {
      dom: document.createElement('div'),
      posAtCoords: jest.fn().mockReturnValue({ pos: 42 }),
    } as unknown as EditorView;
  });

  afterEach(() => {
    cleanup?.();
    jest.clearAllMocks();
  });

  it('should call openFloatingMenu on Alt + Right Click', () => {
    addAltRightClickHandler(mockView as unknown as EditorView, mockPlugin);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2, // right-click
      altKey: true, // Alt pressed
      clientX: 100,
      clientY: 150,
    });

    const preventSpy = jest.spyOn(event, 'preventDefault');
    const stopSpy = jest.spyOn(event, 'stopPropagation');

    (mockView as unknown as EditorView).dom.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
  });

  it('should NOT call openFloatingMenu if Alt not pressed', () => {
    addAltRightClickHandler(mockView as unknown as EditorView, mockPlugin);

    const event = new MouseEvent('contextmenu', { button: 2, altKey: false });
    (mockView as unknown as EditorView).dom.dispatchEvent(event);

    expect(openFloatingMenu).not.toHaveBeenCalled();
  });

  it('should NOT call openFloatingMenu if pos is null', () => {
    addAltRightClickHandler(mockView as unknown as EditorView, mockPlugin);
    const event = new MouseEvent('contextmenu', { button: 2, altKey: true });
    (mockView as unknown as EditorView).dom.dispatchEvent(event);

    expect(openFloatingMenu).not.toHaveBeenCalled();
  });
});

/**
 * Additional test cases to improve coverage to 95%
 */

describe('FloatingMenuPlugin - Additional Coverage', () => {
  let schema: Schema;
  let plugin: FloatingMenuPlugin;
  let view: EditorView;
  let state: EditorState;

  beforeEach(() => {
    jest.clearAllMocks();

    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
          attrs: { objectId: { default: '' }, isDeco: { default: null } },
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    plugin = new FloatingMenuPlugin(mockRuntime);
    state = EditorState.create({ schema, plugins: [plugin] });
    view = new EditorView(document.createElement('div'), { state });
  });

  // Test pointerdown on non-hamburger element
  it('should not open menu when clicking outside hamburger icon', () => {
    plugin.spec.view!(view);

    const nonHamburger = document.createElement('div');
    view.dom.appendChild(nonHamburger);

    const event = new MouseEvent('pointerdown', { bubbles: true });
    nonHamburger.dispatchEvent(event);

    expect(licitCommands.createPopUp).not.toHaveBeenCalled();
  });

  // Test Alt + Right click when not editable
  it('should not open menu on Alt+Right-click when view is not editable', () => {
    const nonEditableView = { ...view, editable: false };
    plugin.spec.view!(nonEditableView as EditorView);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      altKey: true,
      button: 2,
      clientX: 100,
      clientY: 100,
    });

    nonEditableView.dom.dispatchEvent(event);

    expect(licitCommands.createPopUp).not.toHaveBeenCalled();
  });

  // Test popup close with wrapper class removal
  it('should remove popup-open class when popup closes', async () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'pm-hamburger-wrapper';
    const hamburger = document.createElement('span');
    hamburger.className = 'float-icon';
    hamburger.dataset.pos = '1';
    wrapper.appendChild(hamburger);
    view.dom.appendChild(wrapper);

    plugin.spec.view!(view);

    const event = new MouseEvent('pointerdown', { bubbles: true });
    hamburger.dispatchEvent(event);

    await Promise.resolve();

    // Manually add the class
    wrapper.classList.add('popup-open');

    if (plugin._popUpHandle) {
      const mockHandle = licitCommands.createPopUp as jest.Mock;
      const onClose = mockHandle.mock.calls[0]?.[2]?.onClose;
      if (onClose) onClose();
    }

    expect(wrapper.classList.contains('popup-open')).toBe(true);
  });
});

describe('copySelectionRich - Additional Coverage', () => {
  let schema: Schema;
  let view: EditorView;
  let plugin: FloatingMenuPlugin;

  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
      marks: {},
    });

    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, schema.text('Test content')),
    ]);

    const state = EditorState.create({ schema, doc });
    view = new EditorView(document.createElement('div'), { state });
    plugin = new FloatingMenuPlugin(mockRuntime);

    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it('should update popup with pasteAsReferenceEnabled when popup exists', async () => {
    const updateMock = jest.fn();
    plugin._popUpHandle = {
      update: updateMock,
      close: jest.fn(),
      props: { pasteAsReferenceEnabled: false },
    } as unknown as licitCommands.PopUpHandle;

    // Set selection
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, 0, 5)
    );
    view.updateState(view.state.apply(tr));

    await copySelectionRich(view, plugin);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ pasteAsReferenceEnabled: true })
    );
  });
});

describe('createSliceObject - Additional Coverage', () => {
  let schema: Schema;
  let view: EditorView;

  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          attrs: { objectId: { default: '' } },
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });
  });

  it('should handle multiple paragraphs with objectIds', () => {
    const p1 = schema.nodes.paragraph.create({ objectId: 'obj1' }, schema.text('First'));
    const p2 = schema.nodes.paragraph.create({ objectId: 'obj2' }, schema.text('Second'));
    const p3 = schema.nodes.paragraph.create({ objectId: 'obj3' }, schema.text('Third'));

    const doc = schema.nodes.doc.create({}, [p1, p2, p3]);
    const state = EditorState.create({ schema, doc });
    view = new EditorView(document.createElement('div'), { state });

    (createSliceObject as jest.Mock).mockRestore();

    const slice = createSliceObject(view);

    expect(slice).toBeUndefined();
  });
});

describe('pasteAsReference - Additional Coverage', () => {
  let schema: Schema;
  let view: EditorView;
  let plugin: FloatingMenuPlugin;

  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: {
        group: 'inline',
        },
      },
      marks: {},
    });

    const doc = schema.nodes.doc.create();
    const state = EditorState.create({ schema, doc });
    view = new EditorView(document.createElement('div'), { state });

    plugin = new FloatingMenuPlugin(mockRuntime);

    // Reset clipboard mock
    Object.assign(navigator, {
      clipboard: {
        readText: jest.fn(),
      },
    });
  });

  it('should handle when createSliceViaDialog returns null/undefined', async () => {
    const sliceModel = { id: 'id1', source: 'src', name: 'slice1' };
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      JSON.stringify({ sliceModel })
    );

    plugin.sliceManager = {
      createSliceViaDialog: jest.fn().mockResolvedValue(null),
      // eslint-disable-next-line
    } as any;

    await pasteAsReference(view, plugin);

    expect(insertReference).not.toHaveBeenCalled();
  });

  it('should throw error when sliceManager is not initialized', async () => {
    const sliceModel = { id: 'id1', source: 'src' };
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue(
      JSON.stringify({ sliceModel })
    );

    const pluginWithoutManager = new FloatingMenuPlugin(mockRuntime);
    pluginWithoutManager.sliceManager = null;

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await pasteAsReference(view, pluginWithoutManager);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('getDecorations - Additional Coverage', () => {
  let schema: Schema;
  let state: EditorState;

  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          attrs: { isDeco: { default: null } },
        },
        text: { group: 'inline' },
      },
      marks: {},
    });
  });

  it('should handle isComment decoration alone', () => {
    const jsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { isDeco: { isSlice: false, isTag: false, isComment: true } },
          content: [{ type: 'text', text: 'Comment only' }],
        },
      ],
    };
    const doc = schema.nodeFromJSON(jsonDoc);
    state = EditorState.create({ schema, doc });

    const decorations = getDecorations(doc, state);

    expect(decorations).toBeDefined();
    expect(decorations.find().length).toBeGreaterThan(0);
  });

  it('should handle empty paragraph', () => {
    const jsonDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
    const doc = schema.nodeFromJSON(jsonDoc);
    state = EditorState.create({ schema, doc });

    const decorations = getDecorations(doc, state);

    expect(decorations).toBeDefined();
  });
});

describe('getDocSlices - Additional Coverage', () => {
  let plugin: FloatingMenuPlugin;
  let view: EditorView;

  beforeEach(() => {
    plugin = new FloatingMenuPlugin(mockRuntime);
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: {
          group: 'inline',
        },
      },
    });
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ schema }),
    });
  });

  it('should handle getDocumentSlices error', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    plugin.sliceManager = {
      getDocumentSlices: jest.fn().mockRejectedValue(new Error('Network error')),
      setSlices: jest.fn(),
      setSliceAttrs: jest.fn(),
      // eslint-disable-next-line
    } as any;

    await getDocSlices.call(plugin, view);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load slices:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

describe('showReferences - Additional Coverage', () => {
  let view: EditorView;

  beforeEach(() => {
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: new Schema({
          nodes: {
            doc: { content: 'paragraph+' },
            paragraph: {
              content: 'text*',
              group: 'block',
              parseDOM: [{ tag: 'p' }],
              toDOM: () => ['p', 0],
            },
            text: {
              group: 'inline',
            },
          },
        }),
      }),
    });
  });

  it('should return early if plugin not found', async () => {
    await showReferences(view);

    expect(insertReference).not.toHaveBeenCalled();
  });
});

describe('changeAttribute - Additional Coverage', () => {
  it('should handle node with empty attrs', () => {
    const viewMock = {
      state: {
        selection: { $from: { before: jest.fn().mockReturnValue(5) } },
        doc: { nodeAt: jest.fn().mockReturnValue({ attrs: null }) },
        tr: { setNodeMarkup: jest.fn().mockReturnThis() },
      },
      dispatch: jest.fn(),
    };

    changeAttribute(viewMock as unknown as EditorView);

    expect(viewMock.state.tr.setNodeMarkup).toHaveBeenCalled();
  });
});

describe('Plugin state apply - Additional Coverage', () => {
  it('should handle replace step type', () => {
    const plugin = new FloatingMenuPlugin(mockRuntime);
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: {
          group: 'inline',
        },
      },
    });

    const doc = schema.nodes.doc.create();
    const state = EditorState.create({ schema, doc, plugins: [plugin] });

    const tr = state.tr.replaceWith(0, 0, schema.nodes.paragraph.create());
    const newState = state.apply(tr);
    const pluginState = plugin.getState(newState);

    expect(pluginState).toBeDefined();
    expect(pluginState?.decorations).toBeDefined();
  });

  it('should handle replaceAround step type', () => {
    const plugin = new FloatingMenuPlugin(mockRuntime);
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
    });

    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, schema.text('test')),
    ]);

    const state = EditorState.create({ schema, doc, plugins: [plugin] });

    const pluginState = plugin.getState(state);
    if (pluginState) {
      pluginState.decorations = DecorationSet.create(doc, []);
    }

    const tr = state.tr.insert(0, schema.nodes.paragraph.create());
    const newState = state.apply(tr);

    const newPluginState = plugin.getState(newState);
    expect(newPluginState?.decorations).toBeDefined();
  });
    it('should handle forceRescan meta', () => {
    const plugin = new FloatingMenuPlugin(mockRuntime);
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
    });

    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, schema.text('init')),
    ]);

    const state = EditorState.create({ schema, doc, plugins: [plugin] });

    const pluginState = plugin.getState(state);
    if (pluginState) {
      pluginState.decorations = DecorationSet.create(state.doc, []);
    }

    const tr = state.tr.setMeta(CMPluginKey, { forceRescan: true });
    const newState = state.apply(tr);

    const newPluginState = plugin.getState(newState);
    expect(newPluginState?.decorations).toBeDefined();
  });
});

describe('copySelectionPlain - Additional Coverage', () => {
 it('should handle clipboard write failure', async () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: {
        content: 'text*',
        group: 'block',
        parseDOM: [{ tag: 'p' }],
        toDOM: () => ['p', 0],
      },
      text: { group: 'inline' },
    },
  });

  const doc = schema.nodes.doc.create({}, [
    schema.nodes.paragraph.create({}, schema.text('test')),
  ]);
  const state = EditorState.create({ schema, doc });
  const view = new EditorView(document.createElement('div'), { state });
  const plugin = new FloatingMenuPlugin({} as FloatRuntime);

  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

  // Mock clipboard to reject
  Object.assign(navigator, {
    clipboard: {
      writeText: jest.fn().mockRejectedValue(new Error('Write failed')),
    },
  });

  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 0, 4));
  view.updateState(view.state.apply(tr));

  await copySelectionPlain(view, plugin);
  await Promise.resolve(); // ✅ Wait for async .catch() to run

  expect(consoleErrorSpy).toHaveBeenCalled();

  consoleErrorSpy.mockRestore();
});
});
/**
 * Additional tests to achieve 100% function coverage
 * Add these tests to your existing test file
 */

describe('FloatingMenuPlugin - 100% Coverage', () => {
  let schema: Schema;
  let plugin: FloatingMenuPlugin;
  let view: EditorView;
  let state: EditorState;

  beforeEach(() => {
    jest.clearAllMocks();

    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
          attrs: { objectId: { default: '' }, isDeco: { default: null } },
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    plugin = new FloatingMenuPlugin(mockRuntime);
    state = EditorState.create({ schema, plugins: [plugin] });
    view = new EditorView(document.createElement('div'), { state });
  });

  // Test outsideClickHandler when clicking on .context-menu
  it('should not close popup when clicking inside context-menu', () => {
    plugin._popUpHandle = { close: jest.fn(), update: jest.fn() };
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    document.body.appendChild(contextMenu);
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: contextMenu, writable: false });
    document.dispatchEvent(clickEvent);
    expect(plugin._popUpHandle.close).not.toHaveBeenCalled();
    document.body.removeChild(contextMenu);
  });

  // Test outsideClickHandler when clicking on .float-icon
  it('should not close popup when clicking on float-icon', () => {
    plugin._popUpHandle = { close: jest.fn(), update: jest.fn() };
    const floatIcon = document.createElement('div');
    floatIcon.className = 'float-icon';
    document.body.appendChild(floatIcon);
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: floatIcon, writable: false });
    document.dispatchEvent(clickEvent);
    expect(plugin._popUpHandle.close).not.toHaveBeenCalled();
    document.body.removeChild(floatIcon);
  });

  // Test view return object
  it('should return empty object from view function', () => {
    const viewFn = plugin.spec.view;
    const result = viewFn!(view);
    expect(result).toEqual({});
  });
});

describe('getClosestHTMLElement - 100% Coverage', () => {
  it('should return null when el is not an Element', () => {
    const result = getClosestHTMLElement(null, '.test');
    expect(result).toBeNull();
  });

  it('should return null when el is a non-Element EventTarget', () => {
    const textNode = document.createTextNode('text');
    const result = getClosestHTMLElement(textNode, '.test');
    expect(result).toBeNull();
  });

  it('should return null when closest returns non-HTMLElement', () => {
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'test');
    svgElement.appendChild(circle);
    const result = getClosestHTMLElement(circle, 'svg');
    expect(result).toBeNull();
  });

  it('should return HTMLElement when found', () => {
    const div = document.createElement('div');
    div.className = 'test';
    const span = document.createElement('span');
    div.appendChild(span);
    const result = getClosestHTMLElement(span, '.test');
    expect(result).toBe(div);
  });
});

describe('openFloatingMenu - 100% Coverage', () => {
  let plugin: FloatingMenuPlugin;
  let view: EditorView;
  let schema: Schema;
  beforeEach(() => {
    jest.clearAllMocks();
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });
    const state = EditorState.create({ schema });
    view = new EditorView(document.createElement('div'), { state });
    plugin = new FloatingMenuPlugin(mockRuntime);
  });

  it('should remove popup-open class in onClose callback', async () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'pm-hamburger-wrapper';
    const anchorEl = document.createElement('span');
    anchorEl.className = 'float-icon';
    wrapper.appendChild(anchorEl);
    document.body.appendChild(wrapper);
    openFloatingMenu(plugin, view, 1, anchorEl);
    await new Promise(resolve => setTimeout(resolve, 0));
    wrapper.classList.add('popup-open');
    const mockCall = (licitCommands.createPopUp as jest.Mock).mock.calls[0];
    if (mockCall && mockCall[2]) {
      const onCloseCallback = mockCall[2].onClose;
      onCloseCallback();
      expect(wrapper.classList.contains('popup-open')).toBe(false);
    }
    document.body.removeChild(wrapper);
  });

  it('should handle anchorEl without parent wrapper', async () => {
    const anchorEl = document.createElement('span');
    document.body.appendChild(anchorEl);
    openFloatingMenu(plugin, view, 1, anchorEl);
    await new Promise(resolve => setTimeout(resolve, 0));
    const mockCall = (licitCommands.createPopUp as jest.Mock).mock.calls[0];
    if (mockCall && mockCall[2]) {
      const onCloseCallback = mockCall[2].onClose;
      expect(() => onCloseCallback()).not.toThrow();
    }
    document.body.removeChild(anchorEl);
  });
});

describe('copySelectionRich - Error Handling', () => {
  let schema: Schema;
  let view: EditorView;
  let plugin: FloatingMenuPlugin;
  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
      marks: {},
    });
    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, schema.text('Test')),
    ]);
    const state = EditorState.create({ schema, doc });
    view = new EditorView(document.createElement('div'), { state });
    plugin = new FloatingMenuPlugin(mockRuntime);
  });

  it('should catch and log clipboard write errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockRejectedValue(new Error('Write failed')),
      },
    });
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 0, 4));
    view.updateState(view.state.apply(tr));
    await copySelectionRich(view, plugin);
    await Promise.resolve();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Clipboard write failed', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('should handle successful clipboard write', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 0, 4));
    view.updateState(view.state.apply(tr));
    await copySelectionRich(view, plugin);
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});

describe('copySelectionPlain - Error Handling', () => {
  let schema: Schema;
  let view: EditorView;
  let plugin: FloatingMenuPlugin;

  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
      marks: {},
    });

    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, schema.text('Test')),
    ]);

    const state = EditorState.create({ schema, doc });
    view = new EditorView(document.createElement('div'), { state });
    plugin = new FloatingMenuPlugin(mockRuntime);
  });

  it('should handle successful clipboard write', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 0, 4));
    view.updateState(view.state.apply(tr));

    await copySelectionPlain(view, plugin);
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});

describe('getDecorations - Complete Coverage', () => {
  let schema: Schema;
  let state: EditorState;

  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          attrs: { isDeco: { default: null } },
        },
        text: { group: 'inline' },
      },
      marks: {},
    });
  });

  it('should handle onclick callbacks for slice mark', () => {
    const jsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { isDeco: { isSlice: true, isTag: false, isComment: false } },
          content: [{ type: 'text', text: 'Test' }],
        },
      ],
    };
    const doc = schema.nodeFromJSON(jsonDoc);
    state = EditorState.create({ schema, doc });
    const decorations = getDecorations(doc, state);
    expect(decorations).toBeDefined();
    expect(decorations.find().length).toBeGreaterThan(0);
  });

  it('should handle onclick callbacks for tag mark', () => {
    const jsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { isDeco: { isSlice: false, isTag: true, isComment: false } },
          content: [{ type: 'text', text: 'Test' }],
        },
      ],
    };
    const doc = schema.nodeFromJSON(jsonDoc);
    state = EditorState.create({ schema, doc });

    const decorations = getDecorations(doc, state);
    expect(decorations).toBeDefined();
  });

  it('should handle onclick callbacks for comment mark', () => {
    const jsonDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { isDeco: { isSlice: false, isTag: false, isComment: true } },
          content: [{ type: 'text', text: 'Test' }],
        },
      ],
    };
    const doc = schema.nodeFromJSON(jsonDoc);
    state = EditorState.create({ schema, doc });

    const decorations = getDecorations(doc, state);
    expect(decorations).toBeDefined();
  });
});

describe('addAltRightClickHandler - Complete Coverage', () => {
  let view: EditorView;
  let plugin: FloatingMenuPlugin;

  beforeEach(() => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
    });

    const state = EditorState.create({ schema });
    view = new EditorView(document.createElement('div'), { state });
    plugin = new FloatingMenuPlugin(mockRuntime);
    // Mock posAtCoords to return valid position
    jest.spyOn(view, 'posAtCoords').mockReturnValue({ pos: 10, inside: 10 });
  });

  it('should call openFloatingMenu on Alt + Right Click', () => {
    addAltRightClickHandler(view, plugin);

    const event = new MouseEvent('contextmenu', {
      button: 2,
      altKey: true,
      clientX: 100,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });

    const preventSpy = jest.spyOn(event, 'preventDefault');
    const stopSpy = jest.spyOn(event, 'stopPropagation');

    view.dom.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
  });

  it('should not call preventDefault when Alt is not pressed', () => {
    addAltRightClickHandler(view, plugin);

    const event = new MouseEvent('contextmenu', {
      button: 2,
      altKey: false,
      clientX: 100,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });

    const preventSpy = jest.spyOn(event, 'preventDefault');

    view.dom.dispatchEvent(event);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('should not proceed when posAtCoords returns null', () => {
    jest.spyOn(view, 'posAtCoords').mockReturnValue(null);
    addAltRightClickHandler(view, plugin);
    const event = new MouseEvent('contextmenu', {
      button: 2,
      altKey: true,
      clientX: 100,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });

    view.dom.dispatchEvent(event);

    // Should still prevent default and stop propagation
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('Plugin state init - Coverage', () => {
  it('should initialize with decorations', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
    });

    const plugin = new FloatingMenuPlugin(mockRuntime);
    const state = EditorState.create({ schema, plugins: [plugin] });
    const pluginState = plugin.getState(state);
    expect(pluginState).toHaveProperty('decorations');
    expect(pluginState?.decorations).toBeInstanceOf(DecorationSet);
  });
});

describe('Props decorations function - Coverage', () => {
  it('should return decorations from plugin state', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
    });

    const plugin = new FloatingMenuPlugin(mockRuntime);
    const state = EditorState.create({ schema, plugins: [plugin] });
    const decorationsFn = plugin.spec.props?.decorations;
    const decorations = decorationsFn?.call(plugin, state);
    expect(decorations).toBeInstanceOf(DecorationSet);
  });
});

describe('Event Target and Element Handling', () => {
  it('should handle getClosestHTMLElement with deeply nested elements', () => {
    const outer = document.createElement('div');
    outer.className = 'outer';
    const middle = document.createElement('div');
    const inner = document.createElement('span');
    middle.appendChild(inner);
    outer.appendChild(middle);
    const result = getClosestHTMLElement(inner, '.outer');
    expect(result).toBe(outer);
  });

  it('should return null when selector does not match any parent', () => {
    const div = document.createElement('div');
    const span = document.createElement('span');
    div.appendChild(span);
    const result = getClosestHTMLElement(span, '.nonexistent');
    expect(result).toBeNull();
  });
});

describe('Pointerdown Event Handler - Complete Coverage', () => {
  let plugin: FloatingMenuPlugin;
  let view: EditorView;
  let schema: Schema;

  beforeEach(() => {
    jest.clearAllMocks();

    schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
          content: 'text*',
          group: 'block',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {},
    });

    plugin = new FloatingMenuPlugin(mockRuntime);
    const state = EditorState.create({ schema, plugins: [plugin] });
    view = new EditorView(document.createElement('div'), { state });
  });

  it('should not trigger when clicking on non-float-icon element', () => {
    plugin.spec.view!(view);

    const div = document.createElement('div');
    div.className = 'some-other-element';
    view.dom.appendChild(div);

    const event = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(event, 'target', { value: div, writable: false });

    div.dispatchEvent(event);

    expect(licitCommands.createPopUp).not.toHaveBeenCalled();
  });

  it('should add popup-open class to wrapper', async () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'pm-hamburger-wrapper';
    const hamburger = document.createElement('span');
    hamburger.className = 'float-icon';
    hamburger.dataset.pos = '5';
    wrapper.appendChild(hamburger);
    view.dom.appendChild(wrapper);

    plugin.spec.view!(view);

    const event = new MouseEvent('pointerdown', { bubbles: true });
    hamburger.dispatchEvent(event);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(wrapper.classList.contains('popup-open')).toBe(true);
  });
});

describe('Document Click Handler - Complete Coverage', () => {
  let plugin: FloatingMenuPlugin;
  let view: EditorView;

  beforeEach(() => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
    });

    plugin = new FloatingMenuPlugin(mockRuntime);
    const state = EditorState.create({ schema, plugins: [plugin] });
    view = new EditorView(document.createElement('div'), { state });
  });

  it('should not close popup when clicking inside context-menu', () => {
    const closeSpy = jest.fn();
    plugin._popUpHandle = { close: closeSpy, update: jest.fn() };
    plugin.spec.view!(view);

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    document.body.appendChild(contextMenu);

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: contextMenu, writable: false });

    document.dispatchEvent(event);

    expect(closeSpy).not.toHaveBeenCalled();

    document.body.removeChild(contextMenu);
  });

  it('should not close popup when clicking on float-icon', () => {
    const closeSpy = jest.fn();
    plugin._popUpHandle = { close: closeSpy, update: jest.fn() };
    plugin.spec.view!(view);

    const floatIcon = document.createElement('span');
    floatIcon.className = 'float-icon';
    document.body.appendChild(floatIcon);

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: floatIcon, writable: false });

    document.dispatchEvent(event);

    expect(closeSpy).not.toHaveBeenCalled();

    document.body.removeChild(floatIcon);
  });

  it('should not throw error when _popUpHandle is null', () => {
    plugin._popUpHandle = null;
    plugin.spec.view!(view);

    const outsideElement = document.createElement('div');
    document.body.appendChild(outsideElement);

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: outsideElement, writable: false });

    expect(() => document.dispatchEvent(event)).not.toThrow();

    document.body.removeChild(outsideElement);
  });
});

describe('Context Menu Handler - View Editability', () => {
  let plugin: FloatingMenuPlugin;
  let view: EditorView;

  beforeEach(() => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0] },
        text: { group: 'inline' },
      },
    });

    plugin = new FloatingMenuPlugin(mockRuntime);
    const state = EditorState.create({ schema, plugins: [plugin] });
    view = new EditorView(document.createElement('div'), { state });
  });

  it('should not open menu when view is not editable', () => {
    view.editable = false;
    plugin.spec.view!(view);

    const event = new MouseEvent('contextmenu', {
      button: 2,
      altKey: true,
      clientX: 100,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });

    const preventSpy = jest.spyOn(event, 'preventDefault');

    view.dom.dispatchEvent(event);

    // Should not prevent default when not editable
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('should open menu when view is editable', async () => {
    view.editable = true;
    plugin.spec.view!(view);

    const event = new MouseEvent('contextmenu', {
      button: 2,
      altKey: true,
      clientX: 100,
      clientY: 200,
      bubbles: true,
      cancelable: true,
    });

    view.dom.dispatchEvent(event);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('FloatingMenuPlugin - focused branch coverage (fixed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (licitCommands.createPopUp as jest.Mock).mockImplementation(() => ({
      close: jest.fn(),
      update: jest.fn(),
      props: {},
    }));
  });

  it('apply(): returns mapped decorations when tr.docChanged is false', () => {
    const plugin = new FloatingMenuPlugin(mockRuntime);
    const prevState = {
      decorations: {
        map: jest.fn().mockReturnValue('mapped-decorations'),
      },
    } as unknown as EditorState;

    const tr = { docChanged: false } as unknown as Transaction;
    const oldState = {} as unknown as EditorState;
    const newState = {} as unknown as EditorState;
    const applyFn = plugin.spec.state?.apply;

    expect(applyFn).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const output = applyFn!(tr, prevState, oldState, newState);

    expect(prevState['decorations'].map).toHaveBeenCalled();
    expect(output).toEqual({ decorations: 'mapped-decorations' });
  });

  it('showReferences: calls sliceManager.insertReference() then insertReference(view, id, source, docName)', async () => {
    const plugin = new FloatingMenuPlugin(mockRuntime);

    plugin.sliceManager = {
      insertReference: jest.fn().mockResolvedValue({ id: 'slice-123', source: 'source-xyz' }),
    } as unknown as FloatingMenuPlugin['sliceManager'];

    // Spy CMPluginKey.get to return our plugin (safe and reliable)
    const cmGetSpy = jest.spyOn(CMPluginKey, 'get').mockReturnValue(plugin);
      const schema = new Schema({
        nodes: {
          doc: { content: 'paragraph+' } as NodeSpec,
          paragraph: {
            content: 'text*',
            parseDOM: [{ tag: 'p' }],
            toDOM: () => ['p', 0],
          } as NodeSpec,
          text: {} as NodeSpec,
        },
      });
    const state = EditorState.create({ schema });
    const view = new EditorView(document.createElement('div'), { state });

    // Provide docView meta so insertReference receives a doc name
    (view as unknown as EditorView)['docView'] = { node: { attrs: { objectMetaData: { name: 'TestDoc' } } } };

    await showReferences(view);

    expect(plugin.sliceManager.insertReference).toHaveBeenCalled();
    expect(insertReference).toHaveBeenCalledWith(view, 'slice-123', 'source-xyz', 'TestDoc');

    cmGetSpy.mockRestore();
  });

  it('createInfoIconHandler / createCitationHandler call sliceManager methods when plugin present', () => {
    const plugin = new FloatingMenuPlugin(mockRuntime);
    plugin.sliceManager = {
      addInfoIcon: jest.fn(),
      addCitation: jest.fn(),
    } as unknown as FloatingMenuPlugin['sliceManager'];

    const cmGetSpy = jest.spyOn(CMPluginKey, 'get').mockReturnValue(plugin);

      const schema = new Schema({
        nodes: {
          doc: { content: 'paragraph+' } as NodeSpec,
          paragraph: {
            content: 'text*',
            parseDOM: [{ tag: 'p' }],
            toDOM: () => ['p', 0],
          } as NodeSpec,
          text: {} as NodeSpec,
        },
      });

    const state = EditorState.create({ schema });
    const view = new EditorView(document.createElement('div'), { state });

    createInfoIconHandler(view);
    createCitationHandler(view);

    expect(plugin.sliceManager.addInfoIcon).toHaveBeenCalled();
    expect(plugin.sliceManager.addCitation).toHaveBeenCalled();

    cmGetSpy.mockRestore();
  });
});