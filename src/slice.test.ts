
import { EditorView } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import {
    setSliceRuntime,
    setSlices,
    getdocSlices,
    getDocumentslices,
    addSliceToList,
    setSliceAtrrs
} from './slice';
import { FloatRuntime,SliceModel } from './model';

describe('sliceStore', () => {
    const mockSlice: SliceModel = {
        name: 'Test Slice',
        description: 'Test Description',
        id: '1',
        referenceType: 'type1',
        source: 'obj1',
        from: 'a',
        to: 'b',
        ids: ['1']
    };

    let mockState: EditorState;

    beforeEach(() => {
        // Reset internal docSlices
        const slices = getdocSlices();
        slices.length = 0;

        // Reset runtime
        setSliceRuntime(undefined as unknown as FloatRuntime);

        // Mock EditorState
        mockState = {
            doc: { attrs: { objectId: 'obj1' } } as unknown as ProseMirrorNode
        } as EditorState;
    });

    test('setSliceRuntime sets the runtime and getDocumentslices calls it', async () => {
        const runtime = { retrieveSlices: jest.fn().mockResolvedValue([mockSlice]) };
        setSliceRuntime(runtime);

        const slices = await getDocumentslices({} as EditorView);
        expect(runtime.retrieveSlices).toHaveBeenCalled();
        expect(slices).toEqual([mockSlice]);
    });

    test('getDocumentslices returns undefined if runtime not set', async () => {
        const result = await getDocumentslices({} as EditorView);
        expect(result).toBeUndefined();
    });

    test('setSlices filters slices by objectId and stores them', () => {
        const slices: SliceModel[] = [
            { ...mockSlice },
            { ...mockSlice, id: '2', source: 'otherObj' }
        ];

        setSlices(slices, mockState);
        const storedSlices = getdocSlices();

        expect(storedSlices.length).toBe(1);
        expect(storedSlices[0].id).toBe('1');
    });

    test('getdocSlices returns stored slices', () => {
        setSlices([mockSlice], mockState);
        const slices = getdocSlices();
        expect(slices).toHaveLength(1);
        expect(slices[0].name).toBe('Test Slice');
    });

    test('addSliceToList adds a slice and returns updated array', () => {
        const result = addSliceToList(mockSlice);
        expect(result).toContain(mockSlice);
        expect(getdocSlices()).toContain(mockSlice);
    });

    test('setSlices appends to existing slices', () => {
        setSlices([mockSlice], mockState);
        const newSlice: SliceModel = { ...mockSlice, id: '3' };
        setSlices([newSlice], mockState);

        const slices = getdocSlices();
        expect(slices.length).toBe(2);
        expect(slices.map(s => s.id)).toEqual(['1', '3']);
    });
});

describe('setSliceAtrrs', () => {
    let mockView: EditorView;

    beforeEach(() => {
        // Reset module-level state
        getdocSlices().length = 0;
        setSliceRuntime(undefined as unknown as FloatRuntime);

        // Mock view, doc, tr
        const tr = {
            setNodeMarkup: jest.fn().mockImplementation(() => {
                return tr;
            }),
        };

        const nodeWithAttrs = { attrs: { objectId: 'fromId' } };
        const nodeWithoutAttrs = {};

        const doc = {
            descendants: jest.fn((callback) => {
                callback(nodeWithAttrs, 1);  // matching node
                callback(nodeWithoutAttrs, 2); // non-matching node
                return true;
            }),
        };

        const state = {
            tr,
            doc,
        };

        mockView = {
            state,
            dispatch: jest.fn(),
        } as unknown as EditorView;
    });

    test('sets isDeco.isSlice for matching node', () => {
        const slice = { ids: 'slice1', from: 'fromId', to: 'slice1', source: undefined, name: 'Untitled', id: 'http://modusoperandi.com/editor/instance/slice1', referenceType: 'http://modusoperandi.com/ont/document#Reference_nodes', description: '' };

        addSliceToList(slice as unknown as SliceModel);

        setSliceAtrrs(mockView as EditorView);

        expect(mockView.state.doc.descendants).toHaveBeenCalled();
        expect(mockView.state.tr.setNodeMarkup).toHaveBeenCalledWith(
            1,
            undefined,
            expect.objectContaining({
                isDeco: { isSlice: true },
            })
        );
        expect(mockView.dispatch).toHaveBeenCalled();
    });

    test('skips node if objectId does not match', () => {
         const slice = { ids: 'slice1', from: 'otherId', to: 'slice1', source: undefined, name: 'Untitled', id: 'http://modusoperandi.com/editor/instance/slice1', referenceType: 'http://modusoperandi.com/ont/document#Reference_nodes', description: '' };
        addSliceToList(slice as unknown as SliceModel);

        setSliceAtrrs(mockView as EditorView);

        // setNodeMarkup should NOT be called for non-matching node
        expect(mockView.state.tr.setNodeMarkup).not.toHaveBeenCalled();

        expect(mockView.dispatch).toHaveBeenCalled();
    });

});