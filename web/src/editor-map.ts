import { EditorMap as Controller } from './editor-map-controller';

export type EditorMap = Pick<
  Controller,
  | 'select'
  | 'selectWindow'
  | 'begin'
  | 'setPrecision'
  | 'getPrecision'
  | 'appendReference'
  | 'addSegment'
  | 'rectangle'
  | 'finish'
  | 'cancel'
  | 'pick'
  | 'update'
  | 'review'
  | 'dispose'
> & { readonly draw: Controller['draw']; readonly map: Controller['map'] };
export const EditorMap: new (
  ...args: ConstructorParameters<typeof Controller>
) => EditorMap = Controller;
