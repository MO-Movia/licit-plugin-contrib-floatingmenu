/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import { EditorView } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';
import { Node } from 'prosemirror-model';
import { FloatRuntime, SliceModel } from './model';

function getSliceCacheKey(slice: Partial<SliceModel>): string {
  return [
    slice.id ?? '',
    slice.source ?? '',
    slice.from ?? '',
    slice.to ?? '',
    slice.referenceType ?? '',
  ].join('::');
}

function dedupeSlices(slices: SliceModel[]): SliceModel[] {
  const seen = new Set<string>();
  return slices.filter((slice) => {
    const key = getSliceCacheKey(slice);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function createSliceManager(runtime: FloatRuntime) {
  let docSlices: SliceModel[] = [];

  // store slices in cache
  function setSlices(slices: SliceModel[], state: EditorState) {
    const objectId = state.doc.attrs.objectId;
    const filteredSlices = slices.filter((slice) => slice.source === objectId);
    docSlices = dedupeSlices([...docSlices, ...filteredSlices]);
  }

  function getDocSlices() {
    return docSlices;
  }

  // retrieve document slices from server
  function getDocumentSlices(_view: EditorView): Promise<SliceModel[]> {
    return runtime?.retrieveSlices();
  }

  // add new slice to cache
  function addSliceToList(slice: SliceModel) {
    docSlices = dedupeSlices([...docSlices, slice]);
    return docSlices;
  }

  // apply slice attributes to the doc
  function setSliceAttrs(view: EditorView) {
    const result = getDocSlices();
    const sliceIds = new Set(result.map((slice) => slice.from).filter(Boolean));
    if (sliceIds.size === 0) {
      return;
    }

    let tr = view.state.tr;
    let hasChanges = false;

    view.state.doc.descendants((nodeactual: Node, pos) => {
      if (!sliceIds.has(nodeactual?.attrs?.objectId)) {
        return;
      }

      if (nodeactual.attrs?.isDeco?.isSlice) {
        return;
      }

      const newattrs = { ...nodeactual.attrs };
      const isDeco = { ...newattrs.isDeco };
      isDeco.isSlice = true;
      newattrs.isDeco = isDeco;
      tr = tr.setNodeMarkup(pos, undefined, newattrs);
      hasChanges = true;
    });

    if (hasChanges) {
      view.dispatch(tr);
    }
  }

  function addInfoIcon(): void {
    return runtime?.insertInfoIconFloat();
  }

  function addCitation(): void {
    return runtime?.insertCitationFloat();
  }

  function createSliceViaDialog(props: SliceModel): Promise<SliceModel> {
    return runtime?.createSlice(props);
  }
  function insertReference(): Promise<SliceModel> {
    return runtime?.insertReference();
  }

  return {
    setSlices,
    getDocSlices,
    getDocumentSlices,
    addSliceToList,
    setSliceAttrs,
    addInfoIcon,
    addCitation,
    createSliceViaDialog,
    insertReference,
  };
}
