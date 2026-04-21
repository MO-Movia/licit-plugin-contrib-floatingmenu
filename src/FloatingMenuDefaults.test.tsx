/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import { getDefaultMenuItems } from './FloatingMenuDefaults';
import {FloatingMenuItem} from './model';

describe('getDefaultMenuItems', () => {
  beforeEach(() => {});

  it('returns valid FloatingMenuItem objects', () => {
    const items = getDefaultMenuItems();

    items.forEach((item: FloatingMenuItem) => {
      expect(item.label).toBeDefined();
      expect(typeof item.onClick).toBe('function');
    });
  });

  it('wires click handlers correctly', () => {
    const hasClipboard = jest.fn().mockReturnValue(false);
    const items = getDefaultMenuItems({
      hasClipboard,
    });

    items.forEach((item) => {
      item.disabled?.(null!);
    });

    expect(hasClipboard).toHaveBeenCalled();
  });
});
