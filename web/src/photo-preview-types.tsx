import type { Feature } from 'geojson';
import type { BuildingVisual, BuildingSelection } from './visual-types';
import type { CampusData } from './types';
import type { SurfaceFrame } from './model-surface';
import type { ModelPreviewScene } from './model-preview-scene';
export type PhotoPreviewProps = {
  onScene?: (scene: ModelPreviewScene | null) => void;
  meshEditing?: boolean;
  feature: Feature;
  visual?: BuildingVisual;
  data: CampusData;
  wallId?: string;
  selection?: BuildingSelection;
  onSelect?: (selection: BuildingSelection) => void;
  hidden?: string[];
  active?: boolean;
  surface?: SurfaceFrame | null;
  surfaceEditing?: boolean;
  onUnavailable?: () => void;
  onActions?: (x: number, y: number) => void;
  onMetrics?: (metrics: {
    drawMs: number;
    calls: number;
    triangles: number;
    textures: number;
    textureBytes: number;
  }) => void;
};
