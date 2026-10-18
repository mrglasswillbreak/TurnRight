import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2 as ActionTrash2, X as ActionX } from 'lucide-react';
import { facadeWalls } from './building-facades';
import { modelFeature } from './model-authoring';
import { WorkspaceProps } from './model-workspace-shared';
import { ModelButton } from './ModelButton';
import { ModelWorkspace } from './ModelWorkspaceView';
import './photo-model.css';
export default function PhotoModelWorkspace(props: WorkspaceProps) {
  const draft =
    props.workspace?.edits.find(
      (e) => e.kind === 'building' && e.id === props.edit.id && !e.deleted,
    ) || props.edit;
  const facades = draft.properties.appearance?.facades || {};
  const incomplete = Object.entries(facades).filter(
    ([id, f]) =>
      !f ||
      f.wallId !== id ||
      typeof f.partId !== 'string' ||
      !Array.isArray(f.photoIds) ||
      !Array.isArray(f.elements) ||
      !Array.isArray(f.wallCoordinates) ||
      typeof f.notes !== 'string',
  );
  if (!incomplete.length) return <ModelWorkspace {...props} />;
  const walls = facadeWalls(modelFeature(draft));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent
        className="photo-model-workspace"
        finalFocus={props.returnFocus}
      >
        <DialogTitle>
          Repair wall records · {String(draft.properties.name || 'Building')}
        </DialogTitle>
        <DialogDescription>
          An incomplete recovered wall record cannot be opened safely. Your
          draft is preserved. Empty records contain no details, evidence or
          textures; removing one is undoable.
        </DialogDescription>
        {incomplete.map(([id, value]) => (
          <section key={id}>
            <h3>{walls.find((w) => w.wallId === id)?.label || id}</h3>
            {value && Object.keys(value).length === 0 ? (
              <ModelButton
                variant="destructive"
                icon={<ActionTrash2 />}
                onClick={() => {
                  const next = { ...facades };
                  delete next[id];
                  props.onEdit({
                    ...draft,
                    properties: {
                      ...draft.properties,
                      appearance: {
                        ...draft.properties.appearance,
                        facades: next,
                      },
                    },
                  });
                }}
              >
                Remove empty wall record
              </ModelButton>
            ) : (
              <p>
                This record contains incomplete data. Close the workspace and
                download local recovery before repairing it. Its contents have
                not been discarded.
              </p>
            )}
          </section>
        ))}
        <ModelButton
          variant="outline"
          icon={<ActionX />}
          onClick={props.onClose}
        >
          Close workspace
        </ModelButton>
      </DialogContent>
    </Dialog>
  );
}
