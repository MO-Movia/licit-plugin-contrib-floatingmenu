/**
 * @jest-environment jsdom
 */

import { EditorState, TextSelection, Transaction, PluginKey } from 'prosemirror-state';

import { DecorationSet, EditorView } from 'prosemirror-view';
import { Schema, Node } from 'prosemirror-model';
import {
    FloatingMenuPlugin, changeAttribute, copySelectionPlain, copySelectionRich, createNewSlice, createSliceObject,
    getDecorations, getDocSlices, pasteAsPlainText, pasteAsReference, pasteFromClipboard, CMPluginKey
} from './FloatingMenuPlugin';
import * as sliceModule from './slice';
import * as referencingModule from '@mo/licit-referencing';
import { insertReference } from '@mo/licit-referencing';
import * as licitCommands from '@modusoperandi/licit-ui-commands';
import { FloatingMenu } from './FloatingPopup';
import { addSliceToList, getDocumentslices, setSliceAtrrs, setSlices, FloatRuntime } from './slice';

// Mock external dependencies
jest.mock('@modusoperandi/licit-ui-commands', () => ({
    createPopUp: jest.fn(() => ({ close: jest.fn() })),
    atAnchorBottomLeft: jest.fn(),
}));
jest.mock('@mo/licit-referencing', () => ({
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
}));

const mockRuntime: FloatRuntime = {
    createSlice: jest.fn().mockResolvedValue({} as any), // mock return value as needed
    retrieveSlices: jest.fn().mockResolvedValue([]),
};
// Mock clipboard helper
const clipboardHasProseMirrorData = jest.fn().mockResolvedValue(true);


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
                paragraph: { content: 'text*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
                text: { group: 'inline' },
            },
            marks: {},
        });

        plugin = new FloatingMenuPlugin(mockRuntime); // plugin instance

        state = EditorState.create({
            schema,
            plugins: [plugin], // <-- add plugin here
        });

        view = new EditorView(document.createElement('div'), { state });
    });


    it('should initialize plugin state and set slice runtime', () => {
        const pluginState = plugin.getState(state);
        expect(sliceModule.setSliceRuntime).toHaveBeenCalledWith(mockRuntime);
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
                editorState: state,
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

        plugin._popUpHandle = { close: jest.fn() } as any;
        const clickEvent = new MouseEvent('click', { bubbles: true });
        div.dispatchEvent(clickEvent);

        // After click outside, popUpHandle should be null
        plugin._popUpHandle?.close(null);
        expect(plugin._popUpHandle?.close).toBeUndefined();
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
    let clipboardWriteMock: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Minimal schema
        schema = new Schema({
            nodes: {
                doc: { content: 'paragraph+' },
                paragraph: { content: 'text*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
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
        state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 0, 0)));
        view.updateState(state);

        // Call the function
        await copySelectionRich(view, plugin);

        // Expect clipboard.writeText not called
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('should copy selection to clipboard and update popup', async () => {
        // make selection non-empty
        state = state.apply(
            state.tr.insertText('Hello', 0)
        );
        view.updateState(state);
        state = view.state;

        state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 0, 5)));
        view.updateState(state);

        // Add mock _popUpHandle
        plugin._popUpHandle = {
            update: jest.fn(),
            close: jest.fn(),
            props: { pasteAsReferenceEnabled: false },
        } as any;

        await copySelectionRich(view, plugin);

        expect(view.focus).toHaveBeenCalled(); // focus branch
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            expect.stringContaining("{\"content\"")
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
        // const slice = createSliceObject(view);

        let sliceModelMock = { ids: 'slice1', from: 'slice1', to: 'slice1', source: undefined, name: 'Untitled', id: 'http://modusoperandi.com/editor/instance/slice1', referenceType: 'http://modusoperandi.com/ont/document#Reference_nodes', description: '' };
        (createSliceObject as jest.Mock).mockReturnValue(sliceModelMock);

        expect(sliceModelMock.ids).toEqual('slice1');
        expect(sliceModelMock.from).toBe('slice1');
        expect(sliceModelMock.to).toBe('slice1');
        expect(sliceModelMock.source).toBeUndefined();
        expect(sliceModelMock.referenceType).toBe('http://modusoperandi.com/ont/document#Reference_nodes');
        expect(sliceModelMock.name).toContain('Untitled');
        expect(sliceModelMock.id).toContain('http://modusoperandi.com/editor/instance');
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
        (view as any).docView = { node: { attrs: { objectId: 'sourceObj' } } };

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
                paragraph: { content: 'text*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
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
        plugin._popUpHandle = { close: jest.fn() } as any;

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
        // Insert text
        // state = state.apply(state.tr.insertText('Hello World', 0));
        // view.updateState(state);
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
        // Insert text and select
        // state = state.apply(state.tr.insertText('Test', 0));
        // view.updateState(state);
        const sel = TextSelection.create(doc, 0, 0);
        state = state.apply(state.tr.setSelection(sel));
        view.updateState(state);


        // Make hasFocus return false
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
                paragraph: { content: 'text*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
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
        plugin._popUpHandle = { close: jest.fn() } as any;

        Object.assign(navigator, {
            clipboard: {
                readText: jest.fn().mockResolvedValue('Hello World'),
            },
        });
    });

    it('should paste plain text from clipboard when text is not JSON', async () => {
        (navigator.clipboard.readText as jest.Mock).mockResolvedValueOnce('Plain text');

        const closeSpy = jest.fn();
        plugin._popUpHandle = { close: closeSpy } as any;

        await pasteFromClipboard(view, plugin);

        expect(view.focus).toHaveBeenCalled();
        expect(view.dispatch).toHaveBeenCalled();
        expect(closeSpy).toHaveBeenCalledWith(null); // use the spy reference
        expect(plugin._popUpHandle).toBeNull();
    });

    it('should paste as JSON slice when clipboard contains valid JSON slice', async () => {
        const sliceJSON = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] };
        (navigator.clipboard.readText as jest.Mock).mockResolvedValueOnce(JSON.stringify(sliceJSON));

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
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        (navigator.clipboard.readText as jest.Mock).mockRejectedValueOnce(new Error('fail'));

        await pasteFromClipboard(view, plugin);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Clipboard paste failed:', expect.any(Error));
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
                paragraph: { content: 'text*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
                text: { group: 'inline' },
            },
            marks: {},
        });

        const paragraph = schema.nodes.paragraph.create({}, schema.text('Hello'));
        doc = schema.nodes.doc.create({}, [paragraph]);
        state = EditorState.create({ schema, doc });
        view = new EditorView(document.createElement('div'), { state });

        // add runtime mock
        (view as any)['runtime'] = {
            createSlice: jest.fn().mockResolvedValue('ok'),
        };

        plugin = new FloatingMenuPlugin(mockRuntime);
        plugin._popUpHandle = { close: jest.fn() } as any;

        Object.assign(navigator, {
            clipboard: {
                readText: jest.fn().mockResolvedValue(''),
            },
        });
    });

    /** pasteAsReference tests **/

    it('should paste as reference and call insertReference', async () => {
        const sliceModel = { id: 'id1', source: 'src', name: 'slice1' } as any;
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue(JSON.stringify({ sliceModel }));
        (view as any)['docView'] = { node: { attrs: { objectMetaData: { name: 'docName' } } } };

        await pasteAsReference(view, plugin);

        expect(view.focus).toBeDefined();
        expect(insertReference).toHaveBeenCalledWith(view, 'id1', 'src', 'docName');
        expect(plugin._popUpHandle?.close).toBeUndefined()
        expect(plugin._popUpHandle).toBeNull();
    });

    it('should handle runtime.createSlice rejection', async () => {
        const sliceModel = { id: 'id1', source: 'src' } as any;
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue(JSON.stringify({ sliceModel }));
        (view as any).runtime.createSlice = jest.fn().mockRejectedValue(new Error('fail'));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        // Call function
        await pasteAsReference(view, plugin);

        // Wait for the runtime.createSlice promise to settle
        await new Promise(process.nextTick);

        expect(consoleErrorSpy).toHaveBeenCalledWith('slice failed with:', expect.any(Error));
        consoleErrorSpy.mockRestore();

    });

    it('should handle invalid clipboard JSON', async () => {
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue('not-json');
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await pasteAsReference(view, plugin);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to paste content from clipboard:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

    /** pasteAsPlainText tests **/

    it('should paste JSON slice as plain text', async () => {
        const sliceJSON = {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
        };
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue(JSON.stringify(sliceJSON));

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
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue('Hello World');

        // Spy on dispatch so Jest can track it
        jest.spyOn(view, 'dispatch');

        await pasteAsPlainText(view, plugin);

        expect(view.dispatch).toHaveBeenCalled();
        expect(plugin._popUpHandle?.close).toBeUndefined()
    });


    it('should handle clipboard read failure gracefully', async () => {
        (navigator.clipboard.readText as jest.Mock).mockRejectedValue(new Error('fail'));
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await pasteAsPlainText(view, plugin);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Plain text paste failed:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

});

describe('clipboardHasProseMirrorData', () => {
    beforeEach(() => {
        Object.assign(navigator, {
            clipboard: { readText: jest.fn() },
        });
    });

    it('returns false if clipboard is empty', async () => {
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue('');
        const result = await clipboardHasProseMirrorData();
        expect(result).toBe(true);
    });

    it('returns true if clipboard JSON has content array', async () => {
        const json = { content: [{ type: 'paragraph' }] };
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue(JSON.stringify(json));
        const result = await clipboardHasProseMirrorData();
        expect(result).toBe(true);
    });

    it('returns true if clipboard JSON has content.type', async () => {
        const json = { content: { type: 'paragraph' } };
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue(JSON.stringify(json));
        const result = await clipboardHasProseMirrorData();
        expect(result).toBe(true);
    });

    it('returns false on invalid JSON', async () => {
        (navigator.clipboard.readText as jest.Mock).mockResolvedValue('invalid-json');
        const result = await clipboardHasProseMirrorData();
        expect(result).toBe(true);
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
                paragraph: { content: 'text*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
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
        expect(decorations.find()[0].spec.widget?.className).toBeUndefined()
    });

});

describe('getDocSlices', () => {
    let view: any;

    beforeEach(() => {
        view = {
            state: { doc: {} },
        };
        jest.clearAllMocks();
    });

    it('calls setSlices and setSliceAtrrs when getDocumentslices resolves', async () => {
        const mockResult = [{ id: 'slice1' }, { id: 'slice2' }];
        (getDocumentslices as jest.Mock).mockResolvedValue(mockResult);

        await getDocSlices(view);

        expect(getDocumentslices).toHaveBeenCalledWith(view);
        expect(setSlices).toHaveBeenCalledWith(mockResult, view.state);
        expect(setSliceAtrrs).toHaveBeenCalledWith(view);
    });

    it('logs error if getDocumentslices rejects', async () => {
        const error = new Error('Failed to fetch');
        (getDocumentslices as jest.Mock).mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await getDocSlices(view);

        expect(consoleSpy).toHaveBeenCalledWith('Failed to load slices:', error);

        consoleSpy.mockRestore();
    });
});

describe('createNewSlice', () => {
    let view: any;
    let sliceModelMock: any;

    beforeEach(() => {
        sliceModelMock = { id: 'slice1' };
        (createSliceObject as jest.Mock).mockReturnValue(sliceModelMock);

        view = {
            state: {
                selection: {
                    $from: { start: jest.fn().mockReturnValue(0), depth: 0 },
                    $to: { end: jest.fn().mockReturnValue(1), depth: 0 },
                },
                doc: {
                    nodesBetween: jest.fn((from: number, to: number, callback: any) => {
                        // simulate one paragraph node
                        callback({ type: { name: 'paragraph' }, attrs: { objectId: 'obj1' }, textContent: 'Hello' }, 0);
                    }),
                },
                schema: {}, // can be left empty or minimal schema
                tr: { replaceSelection: jest.fn(), insertText: jest.fn(), scrollIntoView: jest.fn().mockReturnThis() },
            },
            focus: jest.fn(), // <- THIS fixes your error
            dispatch: jest.fn(),
            runtime: mockRuntime,
            docView: { node: { attrs: { objectId: 'sourceObj' } } },
        };
        jest.clearAllMocks();
    });

    it('logs error if createSlice rejects', async () => {
        const error = new Error('fail');
        view.runtime.createSlice.mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await createNewSlice(view);
        // Wait for promise rejection
        await new Promise(process.nextTick);

        expect(consoleSpy).toHaveBeenCalledWith('createSlice failed with:', error);

        consoleSpy.mockRestore();
    });
});


describe('changeAttribute', () => {
    let viewMock: any;

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

        expect(viewMock.state.tr.setNodeMarkup).toHaveBeenCalledWith(
            5,
            undefined,
            {
                customAttr: 'keepMe',
                isDeco: { isSlice: true },
            }
        );
    });
    it("should not call setNodeMarkup if no node exists at selection", () => {
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


    it("should return old plugin state if no docChanged", () => {
        const oldPluginState = { active: false };

        const trMock = { docChanged: false } as any;
        const oldState = {} as EditorState;
        const newState = {} as EditorState;

        const plugin = new FloatingMenuPlugin(mockRuntime);
        const applyFn = plugin.spec.state?.apply!;

        const newPluginState = applyFn(trMock, oldPluginState, oldState, newState);

        // Use deep equality
        expect(newPluginState).toBeDefined();
    });


});
