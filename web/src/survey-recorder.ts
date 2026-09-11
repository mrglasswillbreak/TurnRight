import { watchGps } from './gps-acquisition';
import { registerSurveyRecovery } from './update-safety';
import {
  acceptSample,
  pauseSurvey,
  proposeGeometry,
  SURVEY_LIMITS,
  type SurveyRecording,
  type SurveySample,
} from './survey-model';
import { saveSurveyLocal, storeRecording } from './survey-storage';

/** Serial durability before UI acknowledgement; never resumes on visibility change. */
export class SurveyRecorder {
  private stopWatch?: () => void;
  private wake?: WakeLockSentinel;
  private timer?: ReturnType<typeof setInterval>;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private unregister: () => void;
  error = '';
  awake = false;
  pendingWrites = 0;
  latest?: SurveySample;
  constructor(
    public recording: SurveyRecording,
    private changed: () => void,
    private persist = saveSurveyLocal,
  ) {
    this.unregister = registerSurveyRecovery(
      this,
      () => this.recording.session.state === 'recording',
      () => this.flush(),
    );
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.hidden);
  }
  private visibility = () => {
    if (document.hidden)
      void this.pause(
        'Recording paused while TurnRight was hidden. Tap Resume.',
      );
  };
  private hidden = () => {
    void this.pause('Recording paused when leaving the page.');
  };
  private save(sample?: SurveySample) {
    // The queued upload is immutable; copying its raw chunks on each GPS callback
    // would turn incremental recording into an ever-growing full-track copy.
    const { pendingUpload, ...header } = this.recording.session;
    const snapshot = { ...structuredClone(header), pendingUpload };
    this.pendingWrites++;
    this.changed();
    this.queue = this.queue
      .then(() => this.persist(snapshot, sample))
      .catch((e: Error) => {
        this.stop();
        pauseSurvey(
          this.recording.session,
          'Recovery storage failed. Free device storage and retry.',
        );
        this.error = e.message || 'Could not store this recording.';
        this.changed();
        throw e;
      })
      .finally(() => {
        this.pendingWrites--;
        this.changed();
      });
    return this.queue;
  }
  async persistChanges() {
    this.recording.session.updatedAt = new Date().toISOString();
    await this.save();
    this.changed();
  }
  async resume() {
    if (document.hidden || this.disposed) return;
    this.stop();
    if (this.error) await storeRecording(this.recording);
    this.error = '';
    this.queue = this.queue.catch(() => {});
    this.recording.session.state = 'recording';
    this.recording.session.activeSegment = undefined;
    await this.persistChanges();
    if (
      this.disposed ||
      document.hidden ||
      this.recording.session.state !== 'recording'
    )
      return;
    try {
      this.stopWatch = watchGps(
        (fix) => {
          if (this.recording.session.state !== 'recording' || document.hidden)
            return;
          const sample = acceptSample(this.recording, fix);
          this.latest = sample;
          void this.save(sample)
            .then(() => this.changed())
            .catch(() => {});
        },
        (failure) => {
          if (failure.code === 1)
            void this.pause(
              'Location permission denied. Enable it in browser settings, then Resume.',
            );
          else {
            this.recording.session.activeSegment = undefined;
            this.recording.session.pauseReason =
              'Waiting for GPS. The next fix starts a new section.';
            void this.persistChanges().catch(() => {});
          }
        },
      );
      this.timer = setInterval(() => {
        if (
          this.latest &&
          Date.now() - this.latest.timestamp > SURVEY_LIMITS.gap &&
          this.recording.session.activeSegment
        ) {
          this.recording.session.activeSegment = undefined;
          this.recording.session.pauseReason =
            'GPS interrupted. Waiting for a new section.';
          void this.persistChanges().catch(() => {});
        }
      }, 1000);
      try {
        const wake = await navigator.wakeLock?.request('screen');
        if (this.disposed || this.recording.session.state !== 'recording') {
          await wake?.release();
          return;
        }
        this.wake = wake;
        this.awake = !!wake;
        wake?.addEventListener('release', () => {
          this.awake = false;
          this.changed();
        });
      } catch {
        this.awake = false;
      }
    } catch (e) {
      await this.pause((e as Error).message);
    }
    this.changed();
  }
  stop() {
    this.stopWatch?.();
    this.stopWatch = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    void this.wake?.release().catch(() => {});
    this.wake = undefined;
    this.awake = false;
  }
  async pause(reason = 'Paused. Tap Resume to start a new section.') {
    this.stop();
    if (this.recording.session.state === 'recording') {
      pauseSurvey(this.recording.session, reason);
      this.changed();
      await this.persistChanges().catch(() => {});
    }
  }
  async finish() {
    await this.pause();
    this.recording.session.state = 'review';
    const existing = new Set(this.recording.session.review.map((l) => l.id));
    this.recording.session.review.push(
      ...proposeGeometry(this.recording).filter((l) => !existing.has(l.id)),
    );
    await this.persistChanges();
  }
  async flush() {
    await this.queue;
  }
  dispose() {
    this.disposed = true;
    if (this.recording.session.state === 'recording') {
      pauseSurvey(
        this.recording.session,
        'Recording stopped when leaving the editor. Tap Resume.',
      );
      void this.save().catch(() => {});
    }
    this.stop();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.hidden);
    void this.queue.finally(() => this.unregister()).catch(() => {});
  }
}
