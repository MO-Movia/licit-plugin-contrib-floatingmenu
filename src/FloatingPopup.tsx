/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

// FloatingPopup.tsx
import React from 'react';
import { CustomButton } from '@modusoperandi/licit-ui-commands';
import { FloatingMenuItem, FloatingMenuContext } from './FloatingMenuTypes';

interface FloatingMenuProps {
  context: FloatingMenuContext;
  items: FloatingMenuItem[];
}

export class FloatingMenu extends React.PureComponent<FloatingMenuProps> {
  render(): React.ReactNode {
    const { context, items } = this.props;

    return (
      <div className="context-menu" role="menu" tabIndex={-1}>
        <div className="context-menu__items">
          {items.map((item) => {
            const enabled = item.isEnabled
              ? item.isEnabled(context)
              : true;

            return (
              <CustomButton
                key={item.id}
                label={item.label}
                disabled={!enabled}
                onClick={item.onClick}
              />
            );
          })}
        </div>
      </div>
    );
  }
}
