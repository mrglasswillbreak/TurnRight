import { useState, useEffect } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { ModelButton } from './ModelButton';
import {
  modelId,
  type ModelCurve,
  type ModelCurveSegment,
  type ModelObject,
  type Vec3,
} from './model-document';
import { curveMesh } from './model-primitives';
import type { EditorWorkspace } from './editor-workspace';
export function ModelCurveProfileForm({
  buildingId,
  workspace,
  onAdd,
}: {
  buildingId: string;
  workspace?: EditorWorkspace;
  onAdd: (object: ModelObject) => boolean;
}) {
  const [profile, setProfile] = useState<ModelCurve | null>(() => {
      try {
        const s = workspace?.modelInputs[buildingId]?.['mesh:profile'];
        return s ? JSON.parse(s) : null;
      } catch {
        return null;
      }
    }),
    [kind, setKind] = useState<ModelCurveSegment['kind']>('line'),
    [values, setValues] = useState(['4', '0', '2', '2', '3', '2']),
    [depth, setDepth] = useState('2'),
    [error, setError] = useState('');
  useEffect(() => {
    workspace?.recoverModelInput(
      buildingId,
      'mesh:profile',
      profile ? JSON.stringify(profile) : undefined,
    );
  }, [profile, workspace, buildingId]);
  const close = () => {
    if (!profile) return;
    try {
      const end = profile.segments.at(-1)?.end || profile.start,
        closed = {
          ...profile,
          closed: true,
          depth: Number(depth),
          segments: [
            ...profile.segments,
            ...(end[0] === profile.start[0] && end[1] === profile.start[1]
              ? []
              : [{ id: modelId(), kind: 'line' as const, end: profile.start }]),
          ],
        };
      const object = curveMesh(closed, 'Curve profile');
      object.curve = closed;
      if (onAdd(object)) {
        setProfile(null);
        setError('');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="model-profile-form">
      {!profile ? (
        <ModelButton
          icon={<Plus />}
          onClick={() =>
            setProfile({
              start: [0, 0, 0],
              segments: [],
              closed: false,
              depth: 2,
            })
          }
        >
          New curve profile
        </ModelButton>
      ) : (
        <>
          <p>
            Draw a horizontal profile in local metres, starting at 0, 0. Add
            endpoints in boundary order, then close and extrude. The profile
            remains editable.
          </p>
          <label>
            Profile edge
            <select
              aria-label="Profile edge"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="line">Straight</option>
              <option value="arc">Circular arc</option>
              <option value="bezier">Bézier</option>
            </select>
          </label>
          <div className="model-properties-grid">
            {values
              .slice(0, kind === 'line' ? 2 : kind === 'arc' ? 4 : 6)
              .map((v, i) => (
                <label key={i}>
                  {
                    [
                      'End X',
                      'End Y',
                      kind === 'arc' ? 'Through X' : 'Control 1 X',
                      kind === 'arc' ? 'Through Y' : 'Control 1 Y',
                      'Control 2 X',
                      'Control 2 Y',
                    ][i]
                  }
                  <input
                    type="number"
                    step="0.1"
                    value={v}
                    onChange={(e) =>
                      setValues((old) =>
                        old.map((n, j) => (i === j ? e.target.value : n)),
                      )
                    }
                  />
                </label>
              ))}
          </div>
          <ModelButton
            icon={<Plus />}
            onClick={() => {
              if (
                values.some((v) => !v.trim() || !Number.isFinite(Number(v)))
              ) {
                setError('Enter finite profile coordinates.');
                return;
              }
              const end: Vec3 = [Number(values[0]), Number(values[1]), 0],
                c1: Vec3 = [Number(values[2]), Number(values[3]), 0],
                c2: Vec3 = [Number(values[4]), Number(values[5]), 0],
                segment: ModelCurveSegment =
                  kind === 'line'
                    ? { id: modelId(), kind, end }
                    : kind === 'arc'
                      ? { id: modelId(), kind, end, through: c1 }
                      : {
                          id: modelId(),
                          kind,
                          end,
                          control1: c1,
                          control2: c2,
                        };
              setProfile({
                ...profile,
                segments: [...profile.segments, segment],
              });
            }}
          >
            Add profile edge
          </ModelButton>
          <ol>
            {profile.segments.map((s, i) => (
              <li key={s.id}>
                {s.kind}: {s.end[0]}, {s.end[1]} m{' '}
                <ModelButton
                  aria-label={`Remove profile edge ${i + 1}`}
                  onClick={() =>
                    setProfile({
                      ...profile,
                      segments: profile.segments.filter((e) => e.id !== s.id),
                    })
                  }
                >
                  <X size={14} />
                </ModelButton>
              </li>
            ))}
          </ol>
          <label>
            Profile depth (m)
            <input
              type="number"
              min="0"
              max="500"
              step="0.1"
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
            />
          </label>
          <div className="model-toolbar">
            <ModelButton icon={<Check />} onClick={close}>
              Close and extrude profile
            </ModelButton>
            <ModelButton onClick={() => setProfile(null)}>
              Cancel profile
            </ModelButton>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
