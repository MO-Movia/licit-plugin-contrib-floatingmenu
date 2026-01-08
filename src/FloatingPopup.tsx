/**
 * @license MIT
 * @copyright Copyright 2025 Modus Operandi Inc. All Rights Reserved.
 */

import React from 'react';
import { CustomButton } from '@modusoperandi/licit-ui-commands';
import { EditorState } from 'prosemirror-state';

interface FloatingMenuProps {
  editorState: EditorState;
  paragraphPos: number;
  pasteAsReferenceEnabled: boolean;
  enablePasteAsPlainText: boolean;
  copyRichHandler: () => void;
  copyPlainHandler: () => void;
  createCitationHandler: () => void;
  createInfoIconHandler: () => void;
  pasteHandler: () => void;
  pasteAsReferenceHandler: () => void;
  pastePlainHandler: () => void;
  createNewSliceHandler: () => void;
  showReferencesHandler: () => void;
}

export class FloatingMenu extends React.PureComponent<FloatingMenuProps, FloatingMenuProps> {
  constructor(props) {
    super(props);
    this.state = {
      ...props,
    };
  }

  render(): React.ReactNode {
    const { editorState, paragraphPos } = this.props;
    const { selection } = editorState;

    const $from = selection.$from;
    const $to = selection.$to;

    const inThisParagraph =
      $from.before($from.depth) === paragraphPos &&
      $to.before($to.depth) === paragraphPos;

    const isTextSelected = inThisParagraph && !selection.empty;

    const enableCitationAndComment = isTextSelected;
    const enableTagAndInfoicon = inThisParagraph;
    const enableCopy = !selection.empty;

    return (
      <div className="context-menu" role="menu" tabIndex={-1}>
        <div className="context-menu__items">
          <CustomButton
            disabled={!enableCitationAndComment}
            label="Create Citation"
            onClick={this.props.createCitationHandler}
          />
          <CustomButton
            disabled={!enableTagAndInfoicon}
            label="Create Infoicon"
            onClick={this.props.createInfoIconHandler}
          />

          <CustomButton disabled={!enableCopy} label="Copy(Ctrl + C)" onClick={this.props.copyRichHandler} />
          <CustomButton disabled={!enableCopy} label="Copy Without Formatting" onClick={this.props.copyPlainHandler} />

          <CustomButton disabled={!this.props.enablePasteAsPlainText} label="Paste(Ctrl + V)" onClick={() => {
            this.props.pasteHandler();
          }}
          />
          <CustomButton disabled={!this.props.enablePasteAsPlainText} label="Paste As Plain Text" onClick={this.props.pastePlainHandler} />
          <CustomButton
            disabled={!this.props.pasteAsReferenceEnabled}
            label="Paste As Reference(Ctrl + Alt + V)"
            onClick={() => {
              this.props.pasteAsReferenceHandler();
            }}
          />

          <CustomButton label="Create Bookmark" onClick={() => {
            this.props.createNewSliceHandler();
          }}
          />
          <CustomButton label="Insert Reference" onClick={() => {
            this.props.showReferencesHandler();
          }}
          />
        </div>
      </div>
    );
  }
}
