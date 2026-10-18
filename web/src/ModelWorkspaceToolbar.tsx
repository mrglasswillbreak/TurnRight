import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Box,
  Columns2,
  House,
  Image,
  Layers,
  ListChecks,
  MoreHorizontal,
  Paintbrush,
  PanelLeft,
  Pentagon,
  Redo2,
  Undo2,
} from 'lucide-react';
import { Mode } from './model-workspace-shared';
import { ModelButton } from './ModelButton';

import type { ModelEditingControlsBindings } from './useModelEditingControls';
import type { ModelWorkspaceSelectionBindings } from './useModelWorkspaceSelection';
import type { ModelWorkspaceStateBindings } from './useModelWorkspaceState';

type Props = Pick<
  ModelWorkspaceStateBindings,
  | 'onClose'
  | 'workspace'
  | 'onHistory'
  | 'compact'
  | 'modelLayout'
  | 'propertiesOpen'
  | 'setPropertiesOpen'
  | 'setStructureOpen'
  | 'structureOpen'
  | 'openPanel'
  | 'mode'
  | 'setTab'
  | 'before'
  | 'setBefore'
  | 'setRoofDraft'
> &
  Pick<
    ModelWorkspaceSelectionBindings,
    'walls' | 'activeWall' | 'publishErrors'
  > &
  Pick<ModelEditingControlsBindings, 'switchMode'>;
export function ModelWorkspaceToolbar(props: Props) {
  const {
    onClose,
    workspace,
    onHistory,
    compact,
    modelLayout,
    propertiesOpen,
    setPropertiesOpen,
    setStructureOpen,
    structureOpen,
    openPanel,
    mode,
    setTab,
    before,
    setBefore,
    setRoofDraft,
    walls,
    activeWall,
    publishErrors,
    switchMode,
  } = props;
  return (
    <>
      {compact && (
        <div className="model-mobile-navigation">
          <label>
            Mode
            <select
              aria-label="Model editing mode"
              value={mode}
              onChange={(e) => switchMode(e.target.value as Mode)}
            >
              {(
                [
                  'details',
                  'appearance',
                  'roof',
                  'outline',
                  'mesh',
                  'review',
                ] as Mode[]
              ).map((m) => (
                <option key={m} value={m}>
                  {m[0].toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <ModelButton
            variant="outline"
            onClick={() => openPanel('walls')}
            aria-label="Choose wall"
          >
            {walls.find((w) => w.wallId === activeWall)?.label || 'Choose wall'}
          </ModelButton>
          <ModelButton
            variant="outline"
            aria-label="Undo"
            title={
              workspace?.past.length ? 'Undo (Ctrl+Z)' : 'No changes to undo'
            }
            disabled={!workspace?.past.length}
            onClick={() => {
              setRoofDraft(null);
              onHistory?.();
            }}
          >
            ↶
          </ModelButton>
          <ModelButton
            variant="outline"
            aria-label="Redo"
            title={
              workspace?.future.length
                ? 'Redo (Ctrl+Shift+Z)'
                : 'No changes to redo'
            }
            disabled={!workspace?.future.length}
            onClick={() => {
              setRoofDraft(null);
              onHistory?.(true);
            }}
          >
            ↷
          </ModelButton>
          <ModelButton
            variant="outline"
            aria-label="Close workspace"
            onClick={onClose}
          >
            ×
          </ModelButton>
        </div>
      )}
      <div className="model-toolbar model-main-toolbar">
        <ModelButton
          icon={<PanelLeft />}
          size="icon"
          aria-label={structureOpen ? 'Hide structure' : 'Show structure'}
          title={structureOpen ? 'Hide structure' : 'Show structure'}
          aria-expanded={structureOpen}
          aria-controls="model-structure"
          onClick={() => setStructureOpen(!structureOpen)}
        />
        <ToggleGroup
          aria-label="Building editing mode"
          value={[mode]}
          onValueChange={(values) => {
            if (values[0]) switchMode(values[0] as Mode);
          }}
        >
          {(
            [
              ['outline', Pentagon],
              ['appearance', Paintbrush],
              ['roof', House],
              ['details', Layers],
              ['mesh', Box],
              ['review', ListChecks],
            ] as const
          ).map(([m, Icon]) => (
            <ToggleGroupItem key={m} value={m}>
              <Icon size={16} />
              {m[0].toUpperCase() + m.slice(1)}
              {m === 'review' && publishErrors.length
                ? ` (${publishErrors.length})`
                : ''}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="model-toolbar-divider" />
        <ModelButton
          icon={<Undo2 />}
          disabled={!onHistory || !workspace?.past.length}
          title={
            workspace?.past.length ? 'Undo (Ctrl+Z)' : 'No changes to undo'
          }
          onClick={() => {
            setRoofDraft(null);
            onHistory?.();
          }}
        >
          Undo
        </ModelButton>
        <ModelButton
          icon={<Redo2 />}
          disabled={!onHistory || !workspace?.future.length}
          title={
            workspace?.future.length
              ? 'Redo (Ctrl+Shift+Z)'
              : 'No changes to redo'
          }
          onClick={() => {
            setRoofDraft(null);
            onHistory?.(true);
          }}
        >
          Redo
        </ModelButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <ModelButton
                icon={<MoreHorizontal />}
                aria-label="Workspace options"
              />
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() => setPropertiesOpen(!propertiesOpen)}
            >
              {propertiesOpen ? 'Hide properties' : 'Show properties'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setStructureOpen(false);
                setPropertiesOpen(false);
              }}
            >
              Focus canvas
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                modelLayout.reset();
                setStructureOpen(true);
                setPropertiesOpen(true);
              }}
            >
              Reset layout
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBefore((v) => !v)}>
              <Columns2 />
              {before ? 'Show changes' : 'Before / after'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setTab('photo');
                openPanel('none');
              }}
            >
              <Image />
              Photograph reference
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
