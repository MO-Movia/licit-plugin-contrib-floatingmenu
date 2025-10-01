import {EditorView} from 'prosemirror-view';
import {EditorState} from 'prosemirror-state';
import {Node} from 'prosemirror-model';

let docSlices = new Array(0);
let sliceRuntime: FloatRuntime;

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
}

export function setSliceRuntime(runtime) {
  sliceRuntime = runtime;
}

// store slices in cache
export function setSlices(slices: SliceModel[], _state: EditorState) {
  const objectId = _state.doc.attrs.objectId;
  const filteredSlices = slices.filter((slice) => slice.source === objectId);
  docSlices = [...docSlices, ...filteredSlices];
}

export function getdocSlices() {
  return docSlices;
}

// method to retrieve document Slice from the server.
export function getDocumentslices(_view: EditorView): Promise<SliceModel[]> {
  return sliceRuntime?.retrieveSlices();
}

// add the newly created slice to the cache
export function addSliceToList(slice: SliceModel) {
  docSlices.push(slice);
  return docSlices;
}

export function setSliceAtrrs(view: EditorView) {
  const result = getdocSlices();
  let tr = view.state.tr;
  result.forEach((obj) => {
    view.state.doc.descendants((nodeactual: Node, pos) => {
      if (nodeactual?.attrs?.objectId === obj?.from) {
      const newattrs = { ...nodeactual.attrs };
        if (newattrs) {
            const isDeco = { ...(newattrs.isDeco || {}) };
            isDeco.isSlice = true;
            newattrs.isDeco = isDeco;
          tr = tr.setNodeMarkup(pos, undefined, newattrs);
        }
      }
    });
  });
  view.dispatch(tr);
}

