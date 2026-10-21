import SourceMapPreview from './SourceMapPreview';
import { useSourceUpdates, type SourceUpdatesProps } from './useSourceUpdates';
import { SourceUpdateInbox } from './SourceUpdateInbox';
import { SourceUpdateDetails } from './SourceUpdateDetails';
import './source-updates.css';
export default function SourceUpdates(props: SourceUpdatesProps) {
  const state = useSourceUpdates(props);
  const {
    mapPreview,
    mapRef,
    filters,
    attempt,
    setFocusId,
    reveal,
    setMapPreview,
  } = state;

  return (
    <>
      {mapPreview && (
        <SourceMapPreview
          mapRef={mapRef}
          filters={filters}
          revision={attempt}
          onFocus={(id) => {
            setFocusId(id);
            if (innerWidth < 1200) reveal?.('right');
          }}
          onClose={() => setMapPreview(false)}
        />
      )}
      <SourceUpdateInbox state={state} />
      <SourceUpdateDetails state={state} />
    </>
  );
}
