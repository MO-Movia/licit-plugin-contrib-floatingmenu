/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import React from 'react';
import { CustomButton } from '@modusoperandi/licit-ui-commands';
import { FloatingMenuItem, FloatingMenuContext } from './model';

interface FloatingMenuProps {
  context: FloatingMenuContext;
  items: FloatingMenuItem[];
  close: () => unknown;
}

export class FloatingMenu extends React.PureComponent<FloatingMenuProps> {
  render(): React.ReactNode {
    const {context, items, close} = this.props;

    return (
      <div className="context-menu" role="menu">
        <div className="context-menu__items">
          {items.map((item, index) => {
            const disabled = item.disabled ? item.disabled(context) : false;

            return (
              <CustomButton
                key={'FloatingMenuItem_' + index}
                label={
                  item.label + (disabled ? ' (' + String(disabled) + ')' : '')
                }
                disabled={!!disabled}
                onClick={() => {
                  close();
                  item.onClick(
                    context.editorView.state,
                    context.editorView.dispatch,
                    context.editorView
                  );
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }
}
