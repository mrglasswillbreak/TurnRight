import { Layers, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  ImportConfiguration,
  ImportLayerMapping,
} from './map-import-types';
import { roles } from './campus-import-configuration';
import type { CampusWorkspaceState } from './useCampusWorkspace';

export function CampusImportMapping({
  state,
}: {
  state: CampusWorkspaceState;
}) {
  const {
    job,
    configuration,
    setConfiguration,
    sources,
    busy,
    mappedCount,
    startPhase,
  } = state;
  if (!job) return null;
  return (
    <>
      {['mapping', 'preview', 'failed'].includes(job.status) && (
        <>
          <label className="field-label">
            Update existing data
            <select
              value={configuration.refreshMode || 'merge'}
              onChange={(e) =>
                setConfiguration((c) => ({
                  ...c,
                  refreshMode: e.target
                    .value as ImportConfiguration['refreshMode'],
                }))
              }
            >
              <option value="merge">
                Add and update selected layers; retain existing records
              </option>
              <option value="replace-layer">
                Replace selected layers, including missing records
              </option>
              <option value="replace-source">
                Replace the complete source, including missing layers
              </option>
            </select>
          </label>
          <p className="hint">
            Routine geometry fixes are automatic and listed in the preview.
            Uncertain repairs need review.
          </p>
          {job.summary?.layers.map((layer) => {
            const index = configuration.layers.findIndex(
                (m) => m.layer === layer.name,
              ),
              m = configuration.layers[index] || {
                layer: layer.name,
                role: layer.suggestedRole,
              };
            const update = (patch: Partial<ImportLayerMapping>) =>
              setConfiguration((c) => ({
                ...c,
                layers:
                  index < 0
                    ? [...c.layers, { ...m, ...patch }]
                    : c.layers.map((l, i) =>
                        i === index ? { ...l, ...patch } : l,
                      ),
              }));
            return (
              <details
                className="import-layer"
                key={layer.name}
                open={job.status === 'mapping'}
              >
                <summary>
                  <Layers size={16} />
                  <strong>{layer.name}</strong>
                  <span>
                    {layer.count.toLocaleString()} features ·{' '}
                    {layer.format ? `${layer.format} · ` : ''}
                    {layer.sourceCrs || layer.crs || 'Projection required'}
                  </span>
                </summary>
                {layer.exchange && (
                  <p className="small-note">
                    ArcGIS Pro exchange · source ID: {layer.exchange.idField} ·
                    survey: {layer.exchange.surveyDate || 'not recorded'} ·
                    portal modification:{' '}
                    {layer.exchange.modifiedAt
                      ? new Date(layer.exchange.modifiedAt).toLocaleDateString()
                      : 'not recorded'}
                    .{' '}
                    {layer.exchange.rights.redistributionConfirmed
                      ? 'Source rights declared in the exchange receipt; release review is still required.'
                      : 'Reuse rights unresolved. Review this layer’s licence in the local inspection receipt and export again before preparing candidates.'}
                  </p>
                )}
                <div className="campus-fields">
                  <label>
                    Import as
                    <select
                      value={m.role}
                      onChange={(e) =>
                        update({
                          role: e.target.value as ImportLayerMapping['role'],
                        })
                      }
                    >
                      {roles.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Source projection
                    <input
                      value={m.crs || ''}
                      onChange={(e) => update({ crs: e.target.value })}
                      placeholder={layer.sourceCrs || layer.crs || 'EPSG:4326'}
                    />
                    {layer.crs && !layer.requiresCoordinates && (
                      <small>
                        Leave empty to use the file’s detected projection.
                      </small>
                    )}
                  </label>
                  <label>
                    Existing layer identity
                    <input
                      value={m.identity || ''}
                      placeholder={layer.name}
                      onChange={(e) => {
                        const prior = sources
                          .find((s) => s.id === job.source_id)
                          ?.configuration.layers.find(
                            (l) => (l.identity || l.layer) === e.target.value,
                          );
                        update({
                          ...prior,
                          layer: layer.name,
                          identity: e.target.value || undefined,
                        });
                      }}
                      list="accepted-layer-identities"
                    />
                    <small>
                      Keep the accepted layer identity when a replacement file
                      is renamed.
                    </small>
                  </label>
                  {(
                    [
                      'idField',
                      'nameField',
                      'categoryField',
                      'heightField',
                      'floorsField',
                      'accessField',
                      'roadClassField',
                      'surfaceField',
                      'widthField',
                      'landUseField',
                      'vegetationField',
                      'labelField',
                      'geometryField',
                      ...(layer.requiresCoordinates || !layer.crs
                        ? ['longitudeField', 'latitudeField']
                        : []),
                    ] as (keyof ImportLayerMapping)[]
                  ).map((field) => (
                    <label key={field}>
                      {
                        (
                          {
                            idField: 'Stable identifier',
                            nameField: 'Name',
                            categoryField: 'Category',
                            heightField: 'Height',
                            floorsField: 'Floors',
                            accessField: 'Access',
                            roadClassField: 'Road class',
                            surfaceField: 'Surface',
                            widthField: 'Width',
                            landUseField: 'Land use / class',
                            vegetationField: 'Vegetation',
                            labelField: 'Overlay label',
                            geometryField: 'WKT geometry (CSV)',
                            longitudeField: 'Longitude / X',
                            latitudeField: 'Latitude / Y',
                          } as Record<string, string>
                        )[field]
                      }
                      <select
                        value={String(m[field] || '')}
                        onChange={(e) =>
                          update({
                            [field]: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">Not mapped</option>
                        {layer.fields.map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.alias || f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {m.role === 'path' && (
                    <label>
                      Walking access
                      <select
                        value={m.walkingAccess || 'private'}
                        onChange={(e) =>
                          update({
                            walkingAccess: e.target
                              .value as ImportLayerMapping['walkingAccess'],
                          })
                        }
                      >
                        <option value="private">
                          Restricted until reviewed
                        </option>
                        <option value="yes">Walking permitted</option>
                        <option value="no">No walking access</option>
                      </select>
                    </label>
                  )}
                  {m.heightField && (
                    <label>
                      Height units
                      <select
                        value={m.heightUnit || 'm'}
                        onChange={(e) =>
                          update({
                            heightUnit: e.target.value as 'm' | 'ft',
                          })
                        }
                      >
                        <option value="m">Metres</option>
                        <option value="ft">Feet</option>
                      </select>
                    </label>
                  )}
                  {m.widthField && (
                    <label>
                      Width units
                      <select
                        value={m.widthUnit || 'm'}
                        onChange={(e) =>
                          update({
                            widthUnit: e.target.value as 'm' | 'ft',
                          })
                        }
                      >
                        <option value="m">Metres</option>
                        <option value="ft">Feet</option>
                      </select>
                    </label>
                  )}
                  {m.role === 'overlay' && (
                    <>
                      <label>
                        Colour
                        <input
                          type="color"
                          value={m.color || '#2563eb'}
                          onChange={(e) => update({ color: e.target.value })}
                        />
                      </label>
                      <label>
                        Opacity
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.1"
                          value={m.opacity ?? 0.5}
                          onChange={(e) =>
                            update({ opacity: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Layer order
                        <input
                          type="number"
                          min="-1000"
                          max="1000"
                          value={m.order ?? 0}
                          onChange={(e) =>
                            update({ order: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={m.visible !== false}
                          onChange={(e) =>
                            update({ visible: e.target.checked })
                          }
                        />
                        Visible
                      </label>
                    </>
                  )}
                </div>
              </details>
            );
          })}
          <datalist id="accepted-layer-identities">
            {sources
              .find((s) => s.id === job.source_id)
              ?.configuration.layers.map((m) => (
                <option key={m.layer} value={m.identity || m.layer}>
                  {m.identity || m.layer}
                </option>
              ))}
          </datalist>
          <div className="campus-fields">
            <label>
              Attribution
              <input
                value={configuration.attribution}
                onChange={(e) =>
                  setConfiguration((c) => ({
                    ...c,
                    attribution: e.target.value,
                  }))
                }
              />
            </label>
            <label>
              License / permission
              <input
                value={configuration.license}
                onChange={(e) =>
                  setConfiguration((c) => ({
                    ...c,
                    license: e.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="campus-check">
            <input
              type="checkbox"
              checked={configuration.redistributionConfirmed}
              onChange={(e) =>
                setConfiguration((c) => ({
                  ...c,
                  redistributionConfirmed: e.target.checked,
                }))
              }
            />
            This source permits public and offline redistribution with the
            stated attribution.
          </label>
          <Button
            disabled={busy || !mappedCount}
            onClick={() => void startPhase('preview')}
          >
            <RefreshCw />{' '}
            {job.status === 'preview' ? 'Rebuild preview' : 'Build preview'}
          </Button>
        </>
      )}
    </>
  );
}
