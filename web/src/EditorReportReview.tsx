import { Flag, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorReviewState } from './useEditorReview';

export function EditorReportReview({
  state: viewState,
}: {
  state: EditorReviewState;
}) {
  const { tab, state, mapRef, busy, action } = viewState;

  return (
    <>
      {tab === 'reports' && (
        <>
          <h2>Student reports</h2>
          <p className="small-note">
            Reports are private. Review the location before changing the map.
          </p>
          {!state.reports.length && (
            <div className="empty-state">
              <Flag />
              <h3>No pending reports</h3>
            </div>
          )}
          {state.reports.map((report) => (
            <div className="change-card" key={report.id}>
              <strong>{report.category.replaceAll('-', ' ')}</strong>
              <p>{report.description}</p>
              <button
                className="text-button"
                onClick={() =>
                  mapRef.current?.flyTo({
                    center: report.coordinates,
                    zoom: 19,
                  })
                }
              >
                <MapPin size={15} /> Show location
              </button>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    action(
                      'resolve-report',
                      { id: report.id, status: 'dismissed' },
                      'Report dismissed.',
                    )
                  }
                >
                  Dismiss
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    action(
                      'resolve-report',
                      { id: report.id, status: 'resolved' },
                      'Report marked resolved.',
                    )
                  }
                >
                  Mark resolved
                </Button>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
