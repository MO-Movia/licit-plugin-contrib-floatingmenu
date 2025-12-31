/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

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

