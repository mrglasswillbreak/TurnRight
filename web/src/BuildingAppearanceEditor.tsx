import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Box, ArrowUpRight } from 'lucide-react';
import { PhotoModelWorkspace } from './building-appearance-workspace';
import {
  useBuildingAppearance,
  type BuildingAppearanceProps,
} from './useBuildingAppearance';
import { BuildingAppearanceControls } from './BuildingAppearanceControls';
import './building-editor.css';
export function BuildingAppearanceEditor(props: BuildingAppearanceProps) {
  const state = useBuildingAppearance(props);
  const {
    embedded,
    workspaceTrigger,
    setWorkspaceMode,
    setPhotoModelOpen,
    topology,
    edit,
    appearance,
    photoModelOpen,
    data,
    selection,
    onSelection,
    onEdit,
    workspace,
    onHistory,
    workspaceMode,
    workspaceField,
  } = state;

  return (
    <section
      className="building-appearance"
      aria-label="Building appearance editor"
    >
      {!embedded && (
        <div className="model-entry-actions">
          <Button
            className="model-entry-button"

            onClick={(event) => {
              workspaceTrigger.current = event.currentTarget;

              setWorkspaceMode('details');

              setPhotoModelOpen(true);
            }}
          >
            <Box aria-hidden="true" />
            <span>Edit model</span>
            <ArrowUpRight aria-hidden="true" />
          </Button>

          <p className="model-entry-summary">
            {topology.parts.length}{' '}
            {topology.parts.length === 1 ? 'wing' : 'wings'} ·{' '}
            {edit.properties.heightMode === 'floors' && edit.properties.floors
              ? `${edit.properties.floors} floors`
              : edit.properties.height
                ? `${edit.properties.height} m`
                : 'Height unknown'}
            <span>
              {Object.values(appearance.facades || {}).some(
                (f) => !f.reviewedAt || f.needsReview,
              )
                ? 'Details need review'
                : Object.keys(appearance.facades || {}).length
                  ? 'Details reviewed'
                  : 'Generated model'}
            </span>
          </p>
        </div>
      )}
      {photoModelOpen && (
        <Suspense
          fallback={
            <output aria-live="polite">Opening model workspace…</output>
          }
        >
          <PhotoModelWorkspace
            key={edit.id}
            edit={edit}
            data={data}
            selection={selection}
            onSelection={onSelection}
            onEdit={onEdit}
            onClose={() => setPhotoModelOpen(false)}
            returnFocus={workspaceTrigger}
            workspace={workspace}
            onHistory={onHistory}
            initialMode={workspaceMode}
            initialField={workspaceField}
          />
        </Suspense>
      )}
      <BuildingAppearanceControls state={state} />
    </section>
  );
}

export type { BuildingMode } from './building-appearance-workspace';
