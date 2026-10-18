import {
  BookOpen,
  Building2,
  Compass,
  Flag,
  GraduationCap,
  MapPin,
  Utensils,
} from 'lucide-react';
import { lazy } from 'react';
import type { Category } from './types';
export const LandmarkViewButton = lazy(() => import('./LandmarkViewButton'));
export const PlaceInformation = lazy(() =>
  import('./PlaceInformation').then((m) => ({ default: m.PlaceInformation })),
);
export const BuildingVisualDetails = lazy(() =>
  import('./BuildingVisualDetails').then((m) => ({
    default: m.BuildingVisualDetails,
  })),
);
export const ArrivalSection = lazy(() =>
  import('./ArrivalGuide').then((m) => ({ default: m.ArrivalSection })),
);
export const PhotoGallery = lazy(() =>
  import('./ArrivalGuide').then((m) => ({ default: m.PhotoGallery })),
);
export const OfflinePanel = lazy(() =>
  import('./OfflinePanel').then((m) => ({ default: m.OfflinePanel })),
);
export const PublicMapLayout = lazy(() => import('./PublicMapLayout'));
export const RoutePanel = lazy(() =>
  import('./RoutePanel').then((m) => ({ default: m.RoutePanel })),
);
export const AppearanceSettings = lazy(() =>
  import('./AppearanceSettings').then((m) => ({
    default: m.AppearanceSettings,
  })),
);
export const VisitorLayerControls = lazy(
  () => import('./VisitorLayerControls'),
);
export const MapRenderingSettings = lazy(() =>
  import('./MapRenderingSettings').then((m) => ({
    default: m.MapRenderingSettings,
  })),
);
export const ReportForm = lazy(() =>
  import('./ReportForm').then((m) => ({ default: m.ReportForm })),
);
export const Admin = lazy(() => import('./Admin'));
export const CampusSwitcher = lazy(() => import('./CampusSwitcher'));
export const categories: {
  id: Category | 'all';
  label: string;
  Icon: typeof Building2;
}[] = [
  { id: 'all', label: 'All places', Icon: Compass },
  { id: 'academic', label: 'Academics', Icon: GraduationCap },
  { id: 'library', label: 'Libraries', Icon: BookOpen },
  { id: 'food', label: 'Food', Icon: Utensils },
  { id: 'services', label: 'Services', Icon: Building2 },
  { id: 'residence', label: 'Residences', Icon: Building2 },
  { id: 'worship', label: 'Worship', Icon: MapPin },
  { id: 'sports', label: 'Sports', Icon: Flag },
];
