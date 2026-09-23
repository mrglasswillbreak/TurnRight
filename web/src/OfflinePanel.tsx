import { useState } from 'react';
import { Check, Download, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deletePackages, installPackage } from './offline';
import { PHOTO_WARNING_BYTES } from './arrival';
import type { CampusData, CampusPackage } from './types';
export function OfflinePanel({
  manifest,
  latest,
  downloaded,
  navigating,
  swReady,
  onInstall,
  onDelete,
  onCheck,
}: {
  manifest: CampusPackage;
  latest: CampusPackage | null;
  downloaded: boolean;
  navigating: boolean;
  swReady: boolean;
  onInstall: (
    data: CampusData,
    manifest: CampusPackage,
    pending: boolean,
  ) => void;
  onDelete: () => void;
  onCheck: () => void;
}) {
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(''),
    [confirmDelete, setConfirmDelete] = useState(false);
  const target = latest || manifest,
    update = target.version !== manifest.version;
  const install = async () => {
    setError('');
    setProgress(0);
    try {
      const data = await installPackage(
        target,
        setProgress,
        undefined,
        !navigating,
      );
      onInstall(data, target, navigating);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };
  return (
    <div className="settings-content">
      <div className="offline-art">
        <Download size={30} />
        <span className="offline-check">
          <Check size={15} />
        </span>
      </div>
      <h2>Your campus. Anywhere.</h2>
      <p>
        Download LASU Ojo once. Search, campus routes, arrival guides,
        photographs and voice directions stay with you when the connection
        doesn’t.
      </p>
      <div className="download-card">
        <div className="download-title">
          <span className="mini-map">
            <MapGrid />
          </span>
          <div>
            <strong>LASU · Ojo campus</strong>
            <span>
              {(target.bytes / 1048576).toFixed(2)} MB · Map & voice directions
              {target.visuals ? ' + enhanced 3D' : ''}
              {target.photos?.assetUrls.length
                ? ' + all approved photographs'
                : ''}
            </span>
          </div>
        </div>
        <div className="download-meta">
          <span>
            Updated {new Date(manifest.createdAt).toLocaleDateString()}
          </span>
          <span className={downloaded && swReady ? 'ready-label' : ''}>
            {downloaded && swReady
              ? 'Ready offline'
              : downloaded
                ? 'Map downloaded'
                : 'Not downloaded'}
          </span>
        </div>
        <p className="small-note">
          Version {manifest.version} · LASU Ojo campus only
        </p>
        {target.visuals && (
          <p className="small-note">
            Building models: {(target.visuals.bytes / 1048576).toFixed(2)} MB.
            The basic map works while these download.
          </p>
        )}
        {!!manifest.visuals?.assetUrls.length && downloaded && swReady && (
          <p className="ready-label">
            Enhanced 3D ready offline · all model files verified
          </p>
        )}
        {update && (
          <div className="notice">A new map is available. {target.summary}</div>
        )}
        {!!target.photos?.assetUrls.length && (
          <p className="small-note">
            Includes all {target.photos.assetUrls.length} photographs:{' '}
            {(target.photos.bytes / 1048576).toFixed(2)} MB. Every photograph is
            checked before the map is ready offline. Credits and recorded
            arrival information are saved with the map.
          </p>
        )}
        {(target.photos?.bytes || 0) > PHOTO_WARNING_BYTES && (
          <p className="notice">
            This release includes more than 20 MiB of photographs. Consider
            Wi-Fi and available storage. Every approved photograph will be
            downloaded.
          </p>
        )}
        {progress !== null ? (
          <div className="download-progress">
            <progress value={progress} max={100} />
            <span>Downloading and verifying… {progress}%</span>
          </div>
        ) : (
          <Button
            className="primary-action"
            onClick={install}
            disabled={!navigator.onLine}
          >
            <Download size={17} />
            {update
              ? 'Download update'
              : downloaded
                ? 'Verify / repair download'
                : 'Download campus map'}
          </Button>
        )}
      </div>
      {!swReady && (
        <div className="notice">
          Keep this page open while the app finishes saving for offline
          reopening.
        </div>
      )}
      {navigating && (
        <p className="small-note">
          Your current route will keep its map version until navigation ends.
        </p>
      )}
      <div className="settings-row">
        <span>
          <HardDrive size={19} /> Stored on this device
        </span>
        <button className="text-button" onClick={onCheck}>
          <RefreshCw size={15} /> Check updates
        </button>
      </div>
      {downloaded && (
        <div className="settings-row">
          <span>Remove downloaded map</span>
          <button
            className="text-button danger"
            disabled={navigating || progress !== null}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={17} /> Remove
          </button>
        </div>
      )}
      {confirmDelete && (
        <div className="notice">
          You will need an internet connection to download the map again.
          <div className="button-row">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep map
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await deletePackages();
                  onDelete();
                  setConfirmDelete(false);
                } catch {
                  setError(
                    'The browser could not remove this download. Retry or clear this site’s storage in browser settings.',
                  );
                }
              }}
            >
              Remove download
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="small-note">
        The world overview is saved with the app. Zoom out to explore land,
        oceans and countries offline; detailed places and walking routes cover
        LASU Ojo only.
      </p>
      <p className="small-note">
        Your phone supplies location. Keep the app open during navigation.
        Offline maps only include closures known at the last download.
      </p>
    </div>
  );
}
function MapGrid() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
      <rect width="42" height="42" rx="9" fill="#e4eedb" />
      <path
        d="M0 14h42M0 29h42M13 0v42M30 0v42"
        stroke="white"
        strokeWidth="5"
      />
      <path d="M13 37V17q0-3 3-3h15" stroke="#1764ed" strokeWidth="3" />
      <circle
        cx="30"
        cy="14"
        r="4"
        fill="#1764ed"
        stroke="white"
        strokeWidth="2"
      />
    </svg>
  );
}
