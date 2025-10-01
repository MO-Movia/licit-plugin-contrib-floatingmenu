import React from 'react';
import { CustomButton } from '@modusoperandi/licit-ui-commands';
import { createNewSlice } from './FloatingMenuPlugin';
import { EditorView } from 'prosemirror-view';
import {EditorState} from 'prosemirror-state';

interface FloatingMenuProps {
  editorState: EditorState;
  editorView: EditorView;
  paragraphPos: number;
  pasteAsReferenceEnabled: boolean;
  copyRichHandler: () => void;
  copyPlainHandler: () => void;
  pasteHandler: () => void;
  pasteAsReferenceHandler: () => void;
  pastePlainHandler: () => void;
  close?: (menuName: string) => void;
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

    return (
      <div className="context-menu" role="menu" tabIndex={-1}>
        <div className="context-menu__items">
                      <CustomButton
              disabled={!enableCitationAndComment}
              label="Create Citation"
              onClick={() => {
              this.onCreateCitation();
              }}
            />
                    <CustomButton
            disabled={!enableTagAndInfoicon}
            label="Create Infoicon"
            onClick={() => {
            this.onCreateInfoIcon();
            }}
          />

          <CustomButton label="Copy" onClick={this.props.copyRichHandler} />
          <CustomButton label="Copy Without Formatting" onClick={this.props.copyPlainHandler} />

          <CustomButton label="Paste" onClick={() => {
            this.props.pasteHandler();
          }}
          />
          <CustomButton label="Paste As Plain Text" onClick={this.props.pastePlainHandler} />
          <CustomButton
            disabled={!this.props.pasteAsReferenceEnabled}
            label="Paste As Reference"
            onClick={() => {
              this.props.pasteAsReferenceHandler();
            }}
          />

          <CustomButton label="Create Bookmark" onClick={() => { createNewSlice(this.props.editorView); this.props.close?.('Create Slice'); }}
          />
        </div>
      </div>
    );

  }

    private onCreateCitation = (): void => {
    const {editorView } = this.props;
    editorView['runtime'].insertCitation();
    this.props.close?.('Create Citation');
};

  private onCreateInfoIcon = (): void => {
  const { editorView } = this.props;
  editorView['runtime'].insertInfoIcon();
    this.props.close?.('Create Infoicon');
};

  closePopup(menuName: string): void {
    this.props.close?.(menuName);
  }
}
