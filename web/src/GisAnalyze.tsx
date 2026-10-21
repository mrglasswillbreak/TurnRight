import { WorkspacePane } from './WorkspaceFrame';
import { processingTools } from './gis-contracts';
import { useGisAnalysis, type GisAnalysisProps } from './useGisAnalysis';
import { GisAnalysisParameters } from './GisAnalysisParameters';
import { GisProcessingHistory } from './GisProcessingHistory';

export default function GisAnalyze(props: GisAnalysisProps) {
  const viewState = useGisAnalysis(props);
  const { search, setSearch, tool, setTool } = viewState;

  return (
    <>
      <WorkspacePane
        id="left"
        title="Analysis tools"
        className="gis-pane gis-workspace"
      >
        <p>
          Metric tools use the input dataset’s validated projected CRS. WGS84
          source coordinates and navigation permissions are preserved. Results
          become private layers after inspection.
        </p>
        <label>
          Search toolbox
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buffer, join, measure…"
          />
        </label>
        <div className="gis-tools">
          {processingTools
            .filter((t) => t.includes(search.toLowerCase()))
            .map((t) => (
              <button
                key={t}
                className={tool === t ? 'active' : ''}
                onClick={() => setTool(t)}
              >
                {t.replaceAll('-', ' ')}
              </button>
            ))}
        </div>
      </WorkspacePane>
      <GisAnalysisParameters state={viewState} />
      <GisProcessingHistory state={viewState} />
    </>
  );
}
