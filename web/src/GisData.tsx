import { WorkspacePane } from './WorkspaceFrame';
import { useGisData, type GisDataProps } from './useGisData';
import { GisDatasetCatalogue } from './GisDatasetCatalogue';
import { GisAttributeTable } from './GisAttributeTable';
import { GisDatasetSettings } from './GisDatasetSettings';

export default function GisData(props: GisDataProps) {
  const viewState = useGisData(props);
  const { dataset } = viewState;

  return (
    <>
      <GisDatasetCatalogue state={viewState} />
      {!dataset ? (
        <WorkspacePane
          id="bottom"
          title="Attributes"
          className="gis-pane gis-workspace"
        >
          <p>Import campus features in Campuses, or add an asset CSV above.</p>
        </WorkspacePane>
      ) : (
        <>
          <GisAttributeTable state={viewState} />
          <GisDatasetSettings state={viewState} />
        </>
      )}
    </>
  );
}
