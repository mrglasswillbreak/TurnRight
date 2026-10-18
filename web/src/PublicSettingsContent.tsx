import { Button } from '@/components/ui/button';
import { Suspense } from 'react';
import { MotionStatus } from './MotionAssistance';
import { resolvePlaceId } from './map-display';
import { setPreference } from './offline';
import { AppearanceSettings, MapRenderingSettings } from './public-app-shared';

import type { PublicAppStateBindings } from './usePublicAppState';
import type { PublicOfflineLifecycleBindings } from './usePublicOfflineLifecycle';

type Props = Pick<
  PublicAppStateBindings,
  | 'campusScope'
  | 'appearance'
  | 'dark'
  | 'setAppearance'
  | 'simple3D'
  | 'setSimple3D'
  | 'setSelected'
  | 'follow'
  | 'updateReady'
  | 'installingUpdate'
  | 'reportDrafts'
  | 'setDialog'
  | 'setReportPin'
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
  Pick<PublicOfflineLifecycleBindings, 'installAppUpdate' | 'gps'> & {
    data: NonNullable<PublicAppStateBindings['data']>;
    manifest: NonNullable<PublicAppStateBindings['manifest']>;
  };
export function PublicSettingsContent(props: Props) {
  const {
    campusScope,
    appearance,
    dark,
    setAppearance,
    data,
    manifest,
    simple3D,
    setSimple3D,
    setSelected,
    follow,
    updateReady,
    installingUpdate,
    reportDrafts,
    setDialog,
    setReportPin,
    navigating,
    muted,
    setMuted,
    voice,
    previewingVoice,
    setPreviewingVoice,
    voicePreviewFeedback,
    setVoicePreviewFeedback,
    voiceMode,
    setVoiceMode,
    installAppUpdate,
    gps,
  } = props;
  return (
    <div className="settings-content">
      <Suspense fallback={<p>Loading appearance settings...</p>}>
        <AppearanceSettings
          preference={appearance}
          dark={dark}
          onChange={setAppearance}
        />
        <MapRenderingSettings simple={simple3D} onSimple={setSimple3D} />
      </Suspense>
      <div className="settings-row">
        <span>Voice directions</span>
        <button
          role="switch"
          aria-checked={!muted}
          aria-label="Voice directions"
          className={`toggle ${!muted ? 'on' : ''}`}
          onClick={() => {
            setMuted(!muted);
            void setPreference('muted', !muted);
          }}
        >
          <i />
        </button>
      </div>
      <div className="settings-row">
        <span>App update</span>
        <Button
          variant="outline"
          disabled={!updateReady || navigating || installingUpdate}
          onClick={installAppUpdate}
        >
          {installingUpdate
            ? 'Installing…'
            : updateReady
              ? navigating
                ? 'After navigation'
                : 'Install update'
              : 'Up to date'}
        </Button>
      </div>
      <MotionStatus modes fix={gps.fix} following={follow} />
      <p className="small-note">
        {voiceMode === 'natural'
          ? 'Natural offline voice · British English. Saved with the app.'
          : voiceMode === 'basic'
            ? 'Using basic offline voice. Reload online to retry the natural voice.'
            : 'Voice unavailable. Save the app and download the campus map before going offline.'}
      </p>
      <Button
        variant="outline"
        disabled={muted || navigating || previewingVoice}
        onClick={async () => {
          const scope = campusScope.current;
          setPreviewingVoice(true);
          setVoicePreviewFeedback('');
          try {
            await voice.current.unlock();
            if (scope !== campusScope.current) return;
            const mode = await voice.current.load(manifest.version);
            if (scope !== campusScope.current) return;
            setVoiceMode(mode);
            await voice.current.preview();
            if (scope !== campusScope.current) return;
            setVoicePreviewFeedback('Voice preview played.');
          } catch (error) {
            if (scope !== campusScope.current) return;
            setVoicePreviewFeedback(
              error instanceof Error
                ? error.message
                : 'Audio is unavailable. Check device volume and download the campus map.',
            );
          } finally {
            if (scope === campusScope.current) setPreviewingVoice(false);
          }
        }}
      >
        {previewingVoice ? 'Playing preview…' : 'Preview voice directions'}
      </Button>
      {voicePreviewFeedback && (
        <output className="small-note" aria-live="polite">
          {voicePreviewFeedback}
        </output>
      )}
      <p className="small-note">
        Install: in Android Chrome, choose Install app from the menu. On iPhone,
        use Safari → Share → Add to Home Screen. Keep the app visible during
        navigation.
      </p>
      <h3 className="subheading">Map coverage</h3>
      <p className="small-note">
        {data.driving
          ? `Driving enabled: ${data.driving.parking.length} mapped parking/drop-off points. Vehicle access requires separate review; walking approval does not grant driving access.`
          : 'This package supports walking only. Download an updated map for driving.'}
      </p>
      {data.accessPolicy && (
        <p className="small-note">
          Student walking access on the main internal roads was confirmed by the
          project owner on {data.accessPolicy.confirmedAt}. Restricted areas,
          no-walking paths, and closures remain excluded.
        </p>
      )}
      <p>
        {data.coverage.placeCount} places · {data.coverage.approachCount} mapped
        approaches · {data.coverage.routableCount} connected entrances.
      </p>
      <p className="notice">
        This source-derived campus map has not been field-verified. Missing
        entrances and paths are shown in place details.
      </p>
      {reportDrafts.length > 0 && (
        <>
          <h3 className="subheading">Saved report drafts</h3>
          {reportDrafts.map((draft) => (
            <Button
              key={draft.key}
              variant="outline"
              onClick={() => {
                setSelected(
                  data.places.find(
                    (p) => p.id === resolvePlaceId(data, draft.placeId || ''),
                  ) || null,
                );
                setReportPin(draft.coordinates);
                setDialog('report');
              }}
            >
              {draft.name} · Resume draft
            </Button>
          ))}
        </>
      )}
      <h3 className="subheading">Your privacy</h3>
      <p>
        Location and navigation history stay on your phone. Student reports only
        send the pin and description you submit. TurnRight is an independent
        personal project, not an official university service.
      </p>
      <h3 className="subheading">Sources & attribution</h3>
      {data.sources.map((source) => (
        <p key={source.id}>
          <a
            className="source-link"
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            {source.attribution}
          </a>
          <br />
          <span className="small-note">{source.license}</span>
          {(source.licenseText || source.notice) && (
            <details>
              <summary>Offline license and notices</summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {source.licenseText}
                {source.notice ? `\n\n${source.notice}` : ''}
              </pre>
            </details>
          )}
        </p>
      ))}
      <a className="text-button" href={manifest.dataUrl} download>
        Download source-derived campus database
      </a>
      <p className="small-note">
        English voice directions · Walking only · Updated{' '}
        {new Date(manifest.createdAt).toLocaleDateString()} · {manifest.version}
      </p>
    </div>
  );
}
