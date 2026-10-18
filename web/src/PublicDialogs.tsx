import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Flag, Shield } from 'lucide-react';
import { Suspense } from 'react';
import { SheetHandle } from './ResizableSheet';
import { buildingPhotos } from './arrival';
import { DEFAULT_CAMPUS } from './campus-context';
import { publicEditorHref } from './editor-link';
import {
  BuildingVisualDetails,
  OfflinePanel,
  PhotoGallery,
  ReportForm,
} from './public-app-shared';
import type { Position } from './types';

import { PublicSettingsContent } from './PublicSettingsContent';
import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicOfflineLifecycleBindings } from './usePublicOfflineLifecycle';
type Props = Pick<
  PublicAppStateBindings,
  | 'campusScope'
  | 'appearance'
  | 'dark'
  | 'setAppearance'
  | 'setData'
  | 'setManifest'
  | 'latest'
  | 'setToast'
  | 'simple3D'
  | 'setSimple3D'
  | 'unlinkedBuilding'
  | 'selected'
  | 'setSelected'
  | 'follow'
  | 'updateReady'
  | 'installingUpdate'
  | 'dialogSheet'
  | 'reportDrafts'
  | 'refreshDrafts'
  | 'dialog'
  | 'setDialog'
  | 'reportPin'
  | 'setReportPin'
  | 'downloaded'
  | 'setDownloaded'
  | 'swReady'
  | 'setRouteView'
  | 'setRoutes'
  | 'navigating'
  | 'muted'
  | 'setMuted'
  | 'voice'
  | 'previewingVoice'
  | 'setPreviewingVoice'
  | 'voicePreviewFeedback'
  | 'setVoicePreviewFeedback'
  | 'voiceMode'
  | 'setVoiceMode'
> &
  Pick<
    PublicOfflineLifecycleBindings,
    | 'installAppUpdate'
    | 'gps'
    | 'checkingDownload'
    | 'setCheckingDownload'
    | 'downloadGeneration'
    | 'checkUpdates'
  > & {
    data: NonNullable<PublicAppStateBindings['data']>;
    manifest: NonNullable<PublicAppStateBindings['manifest']>;
    campusName: string;
  };
export function PublicDialogs(props: Props) {
  const {
    campusScope,
    data,
    setData,
    manifest,
    setManifest,
    latest,
    setToast,
    unlinkedBuilding,
    selected,
    setSelected,
    dialogSheet,
    refreshDrafts,
    dialog,
    setDialog,
    reportPin,
    setReportPin,
    downloaded,
    setDownloaded,
    swReady,
    setRouteView,
    setRoutes,
    navigating,
    checkingDownload,
    setCheckingDownload,
    downloadGeneration,
    checkUpdates,
    campusName,
  } = props;
  return (
    <Dialog
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) setDialog(null);
      }}
    >
      <DialogContent
        className="app-dialog resizable-dialog"
        style={dialogSheet.style}
      >
        <SheetHandle sheet={dialogSheet} label="Resize dialog" />
        <DialogHeader>
          <DialogTitle>
            {dialog === 'building'
              ? String(unlinkedBuilding?.properties?.name || 'Campus building')
              : dialog === 'offline'
                ? 'Offline maps'
                : dialog === 'report'
                  ? 'Report a map issue'
                  : 'Settings & map information'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'building'
              ? 'Building footprint and source information.'
              : dialog === 'offline'
                ? `Take ${campusName} with you.`
                : dialog === 'report'
                  ? 'Help make campus easier to navigate.'
                  : 'Make TurnRight work for you.'}
          </DialogDescription>
        </DialogHeader>
        <div className="dialog-scroll-content">
          {dialog === 'building' && unlinkedBuilding && (
            <div className="settings-content">
              <Suspense fallback={null}>
                <BuildingVisualDetails data={data} feature={unlinkedBuilding} />
                <PhotoGallery
                  photos={buildingPhotos(
                    data,
                    String(unlinkedBuilding.properties?.id || ''),
                  )}
                />
              </Suspense>
              <a
                className="editor-primary"
                href={publicEditorHref(
                  data,
                  null,
                  String(unlinkedBuilding.properties?.id || ''),
                )}
              >
                <Shield size={18} /> Editor
              </a>
              <p>
                Source:{' '}
                {String(unlinkedBuilding.properties?.source || 'Campus map')}.
                This footprint is not yet linked to a named destination.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  const g = unlinkedBuilding.geometry;
                  const point =
                    g.type === 'Polygon'
                      ? g.coordinates[0][0]
                      : g.type === 'MultiPolygon'
                        ? g.coordinates[0][0][0]
                        : undefined;
                  if (point) setReportPin(point as Position);
                  setDialog('report');
                }}
              >
                <Flag /> Report building details
              </Button>
            </div>
          )}
          {dialog === 'offline' && (
            <Suspense fallback={<p>Opening offline downloads…</p>}>
              <OfflinePanel
                key={campusScope.current}
                manifest={manifest}
                latest={latest}
                downloaded={downloaded}
                checking={checkingDownload}
                navigating={navigating}
                swReady={swReady}
                onCheck={() => void checkUpdates(true)}
                onDelete={() => {
                  if (
                    (manifest.campus?.slug || DEFAULT_CAMPUS) !==
                    campusScope.current
                  )
                    return;
                  downloadGeneration.current++;
                  setDownloaded(false);
                  setCheckingDownload(false);
                }}
                onInstall={(nextData, nextManifest, pending) => {
                  if (
                    (nextManifest.campus?.slug || DEFAULT_CAMPUS) !==
                    campusScope.current
                  )
                    return;
                  downloadGeneration.current++;
                  setCheckingDownload(false);
                  setDownloaded(true);
                  if (!pending) {
                    setData(nextData);
                    setManifest(nextManifest);
                    setRoutes([]);
                    setRouteView(false);
                    setSelected(null);
                  }
                  setToast(
                    pending
                      ? 'Download complete. It will activate after your walk.'
                      : 'Campus map downloaded and verified.',
                  );
                }}
              />
            </Suspense>
          )}{' '}
          {dialog === 'report' && (
            <Suspense fallback={<p>Loading report form...</p>}>
              <ReportForm
                key={campusScope.current}
                onDraftSaved={refreshDrafts}
                place={selected}
                coordinates={reportPin}
                onDone={() => {
                  if (
                    (manifest.campus?.slug || DEFAULT_CAMPUS) !==
                    campusScope.current
                  )
                    return;
                  setDialog(null);
                  setToast(
                    'Report submitted. Thank you for helping improve the map.',
                  );
                }}
              />
            </Suspense>
          )}{' '}
          {dialog === 'settings' && (
            <PublicSettingsContent {...props} data={data} manifest={manifest} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
