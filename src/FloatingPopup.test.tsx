/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';
import {FloatingMenu} from './FloatingPopup';
import {FloatingMenuItem} from './model';
import {EditorView} from 'prosemirror-view';
import {EditorState} from 'prosemirror-state';

// Mock the CustomButton component
jest.mock('@modusoperandi/licit-ui-commands', () => ({
  CustomButton: ({
    label,
    disabled,
    onClick,
  }: {
    label: string;
    disabled: boolean;
    onClick: () => void;
  }) => (
    <button
      data-testid="custom-button"
      disabled={disabled}
      onClick={onClick}
      className={disabled ? 'disabled' : ''}
    >
      {label}
    </button>
  ),
}));

describe('FloatingPopup', () => {
  const mockClose = jest.fn();
  const mockOnClick = jest.fn();
  const mockDispatch = jest.fn();

  const mockView = {
    state: {} as EditorState,
    dispatch: mockDispatch,
  } as unknown as EditorView;

  const mockContext = {
    editorView: mockView,
    editorState: {} as EditorState,
    paragraphPos: 0,
  };

  const mockItems: FloatingMenuItem[] = [
    {
      label: 'Copy',
      onClick: mockOnClick,
    },
    {
      label: 'Paste',
      onClick: mockOnClick,
      disabled: () => 'No clipboard data',
    },
    {
      label: 'Cut',
      onClick: mockOnClick,
      disabled: () => undefined,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the floating menu with items', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const buttons = screen.getAllByTestId('custom-button');
      expect(buttons).toHaveLength(3);
    });

    it('should render with correct role attribute', () => {
      const {container} = render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const menu = container.querySelector('[role="menu"]');
      expect(menu).toBeInTheDocument();
    });

    it('should render item labels correctly', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      expect(screen.getByText('Copy')).toBeInTheDocument();
      expect(screen.getByText('Paste (No clipboard data)')).toBeInTheDocument();
      expect(screen.getByText('Cut')).toBeInTheDocument();
    });

    it('should handle empty items array', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={[]}
          close={mockClose}
        />
      );

      const buttons = screen.queryAllByTestId('custom-button');
      expect(buttons).toHaveLength(0);
    });
  });

  describe('Disabled state', () => {
    it('should disable item when disabled function returns string', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const pasteButton = screen.getAllByTestId('custom-button')[1];
      expect(pasteButton).toBeDisabled();
      expect(pasteButton).toHaveTextContent('Paste (No clipboard data)');
    });

    it('should not disable item when disabled function returns undefined', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const cutButton = screen.getAllByTestId('custom-button')[2];
      expect(cutButton).not.toBeDisabled();
      expect(cutButton).toHaveTextContent('Cut');
    });

    it('should not disable item when disabled function is not provided', () => {
      const itemsWithoutDisabled: FloatingMenuItem[] = [
        {
          label: 'Copy',
          onClick: mockOnClick,
        },
      ];

      render(
        <FloatingMenu
          context={mockContext}
          items={itemsWithoutDisabled}
          close={mockClose}
        />
      );

      const copyButton = screen.getByTestId('custom-button');
      expect(copyButton).not.toBeDisabled();
    });
  });

  describe('Click handling', () => {
    it('should call close and onClick when item is clicked', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const copyButton = screen.getAllByTestId('custom-button')[0];
      fireEvent.click(copyButton);

      expect(mockClose).toHaveBeenCalled();
      expect(mockOnClick).toHaveBeenCalledWith(mockContext);
    });

    it('should not call onClick when disabled item is clicked', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const pasteButton = screen.getAllByTestId('custom-button')[1];
      fireEvent.click(pasteButton);

      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('should handle multiple clicks on different items', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const copyButton = screen.getAllByTestId('custom-button')[0];
      const cutButton = screen.getAllByTestId('custom-button')[2];

      fireEvent.click(copyButton);
      fireEvent.click(cutButton);

      expect(mockOnClick).toHaveBeenCalledTimes(2);
      expect(mockClose).toHaveBeenCalledTimes(2);
    });
  });

  describe('Component behavior', () => {
    it('should update when items prop changes', () => {
      const {rerender} = render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      expect(screen.getAllByTestId('custom-button')).toHaveLength(3);

      const newItems: FloatingMenuItem[] = [
        {
          label: 'New Item',
          onClick: mockOnClick,
        },
      ];

      rerender(
        <FloatingMenu
          context={mockContext}
          items={newItems}
          close={mockClose}
        />
      );

      expect(screen.getAllByTestId('custom-button')).toHaveLength(1);
      expect(screen.getByText('New Item')).toBeInTheDocument();
    });

    it('should update when context prop changes', () => {
      const {rerender} = render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const newContext = {
        ...mockContext,
        paragraphPos: 10,
      };

      rerender(
        <FloatingMenu
          context={newContext}
          items={mockItems}
          close={mockClose}
        />
      );

      // The component should re-render with new context
      expect(screen.getAllByTestId('custom-button')).toHaveLength(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle null context gracefully', () => {
      // TypeScript should prevent this, but we test runtime behavior
      expect(() => {
        render(
          <FloatingMenu
            // @ts-expect-error - testing runtime behavior with invalid input
            context={null}
            items={mockItems}
            close={mockClose}
          />
        );
      }).not.toThrow();
    });

    it('should handle items without onClick', () => {
      const invalidItems: FloatingMenuItem[] = [
        {
          label: 'Invalid',
          // @ts-expect-error - testing runtime behavior with invalid input
          onClick: null,
        },
      ];

      expect(() => {
        render(
          <FloatingMenu
            context={mockContext}
            items={invalidItems}
            close={mockClose}
          />
        );
      }).not.toThrow();
    });

    it('should handle disabled function that throws error', () => {
      const errorItems: FloatingMenuItem[] = [
        {
          label: 'Error Item',
          onClick: mockOnClick,
          disabled: () => {
            throw new Error('Disabled function error');
          },
        },
      ];

      expect(() => {
        render(
          <FloatingMenu
            context={mockContext}
            items={errorItems}
            close={mockClose}
          />
        );
      }).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have correct ARIA role', () => {
      const {container} = render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const menu = container.querySelector('.context-menu');
      expect(menu).toHaveAttribute('role', 'menu');
    });

    it('should have disabled attribute on disabled buttons', () => {
      render(
        <FloatingMenu
          context={mockContext}
          items={mockItems}
          close={mockClose}
        />
      );

      const pasteButton = screen.getAllByTestId('custom-button')[1];
      expect(pasteButton).toHaveAttribute('disabled');
    });
  });
});
