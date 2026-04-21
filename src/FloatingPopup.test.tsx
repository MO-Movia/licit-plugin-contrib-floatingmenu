/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { FloatingMenu } from './FloatingPopup';
import { FloatingMenuItem, FloatingMenuContext } from './model';

// Mock CustomButton → render as native <button>
jest.mock('@modusoperandi/licit-ui-commands', () => ({
  CustomButton: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick: () => void;
    disabled: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

describe('FloatingMenu (UI)', () => {
  let container: HTMLDivElement;
  let handlers: Record<string, jest.Mock>;
  let items: FloatingMenuItem[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    handlers = {
      addComment: jest.fn(),
      addTag: jest.fn(),
      createCitation: jest.fn(),
      createInfoIcon: jest.fn(),
      copyRich: jest.fn(),
      copyPlain: jest.fn(),
      paste: jest.fn(),
      pastePlain: jest.fn(),
      pasteAsReference: jest.fn(),
      createSlice: jest.fn(),
      showReferences: jest.fn(),
    };

    items = [
      {
        label: 'Add Comment',
        onClick: handlers.addComment,
      },
      {
        label: 'Add Tag',
        onClick: handlers.addTag,
      },
      {
        label: 'Create Citation',
        onClick: handlers.createCitation,
      },
      {
        label: 'Create Info Icon',
        onClick: handlers.createInfoIcon,
      },
      {
        label: 'Copy (Ctrl + C)',
        onClick: handlers.copyRich,
      },
      {
        label: 'Copy Without Formatting',
        onClick: handlers.copyPlain,
      },
      {
        label: 'Paste (Ctrl + V)',
        onClick: handlers.paste,
      },
      {
        label: 'Paste As Plain Text',
        onClick: handlers.pastePlain,
      },
      {
        label: 'Paste As Reference (Ctrl + Alt + V)',
        onClick: handlers.pasteAsReference,
        isEnabled: () => true,
      },
      {
        label: 'Create Referent',
        onClick: handlers.createSlice,
      },
      {
        label: 'Insert Reference',
        onClick: handlers.showReferences,
      },
    ];
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    jest.clearAllMocks();
  });

  function render(itemsOverride = items) {
    ReactDOM.render(
      <FloatingMenu
        context={{} as unknown as FloatingMenuContext}
        items={itemsOverride}
        close={() => undefined}
      />,
      container
    );
  }

  function getButton(label: string): HTMLButtonElement {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === label
    );
    if (!btn) {
      throw new Error(`Button "${label}" not found`);
    }
    return btn;
  }

  it('renders all buttons from config', () => {
    render();

    const labels = Array.from(container.querySelectorAll('button')).map(
      (b) => b.textContent
    );

    expect(labels).toEqual([
      'Add Comment',
      'Add Tag',
      'Create Citation',
      'Create Info Icon',
      'Copy (Ctrl + C)',
      'Copy Without Formatting',
      'Paste (Ctrl + V)',
      'Paste As Plain Text',
      'Paste As Reference (Ctrl + Alt + V)',
      'Create Referent',
      'Insert Reference',
    ]);
  });

  it('disables button when isEnabled returns false', () => {
    items[0] = {
      ...items[0],
      isEnabled: () => false,
    };

    render(items);

    const btn = getButton('Add Comment');
    expect(btn.disabled).toBe(true);
  });

  it('enables button when isEnabled returns true', () => {
    items[0] = {
      ...items[0],
      isEnabled: () => true,
    };

    render(items);

    const btn = getButton('Add Comment');
    expect(btn.disabled).toBe(false);
  });

  it('renders empty menu safely when no items provided', () => {
    render([]);

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });
});