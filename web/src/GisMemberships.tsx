import { WorkspacePane } from './WorkspaceFrame';
import { gisApi } from './gis-api';
import type { GisReviewState } from './useGisReview';

export function GisMemberships({
  state: viewState,
}: {
  state: GisReviewState;
}) {
  const {
    membershipsOnly,
    can,
    members,
    setMemberId,
    setRoles,
    memberId,
    roles,
    busy,
    attempt,
    mutate,
  } = viewState;

  return (
    <>
      {membershipsOnly && can('manage') && (
        <WorkspacePane
          id="right"
          title="Campus memberships"
          className="gis-pane gis-workspace"
        >
          <details open>
            <summary>Campus memberships</summary>
            <p>
              Members sign in first; use their Auth account UUID. Roles are
              composable. Clearing all roles revokes campus access.
            </p>
            {members.map((m) => (
              <button
                key={m.user_id}
                onClick={() => {
                  setMemberId(m.user_id);
                  setRoles(m.roles);
                }}
              >
                {m.user_id} · {m.roles.join(', ')}
              </button>
            ))}
            <label>
              Account UUID
              <input
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              />
            </label>
            {(
              ['administrator', 'editor', 'reviewer', 'publisher'] as const
            ).map((role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={(e) =>
                    setRoles((r) =>
                      e.target.checked
                        ? [...r, role]
                        : r.filter((x) => x !== role),
                    )
                  }
                />
                {role}
              </label>
            ))}
            <button
              disabled={busy || !memberId}
              onClick={() =>
                void attempt(() =>
                  mutate(() =>
                    gisApi('gis-member-save', {
                      userId: memberId,
                      roles,
                      operationId: crypto.randomUUID(),
                    }),
                  ),
                )
              }
            >
              Save membership
            </button>
          </details>
        </WorkspacePane>
      )}
    </>
  );
}
