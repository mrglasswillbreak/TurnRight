/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- Focusable window splitter follows the ARIA separator interaction pattern. */
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { useEditorSession } from './EditorSession';
import { attributeInputReference, type EditorTask } from './editor-session';
import type { EditorCommand } from './EditorCommands';
import './editor-shell.css';
const Commands = lazy(() => import('./EditorCommands'));
export const reviewTasks = [
  'gis-review',
  'changes',
  'duplicates',
  'reports',
  'draft-changes',
];
export function EditorChrome({
  children,
  campus,
  onTask,
  saveStatus,
  blocked,
  onBackup,
  onExportBackup,
  onRefresh,
  onSignOut,
  onSurvey,
  surveyActive,
  online = true,
}: {
  children: ReactNode;
  campus: string;
  onTask: (task: EditorTask) => void;
  saveStatus: string;
  blocked?: boolean;
  onBackup?: () => void;
  onExportBackup?: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onSurvey?: () => void;
  surveyActive?: boolean;
  online?: boolean;
}) {
  const session = useEditorSession(),
    { state, capabilities, pending, failure } = session;
  const [commandsOpen, setCommandsOpen] = useState(false);
  const canEdit = capabilities.capabilities.includes('edit');
  const task = (value: EditorTask) => {
    document
      .querySelectorAll<HTMLDetailsElement>('.unified-header details[open]')
      .forEach((menu) => {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      });
    onTask(value);
  };
  const commands: EditorCommand[] = [
    { id: 'map', label: 'Return to map', run: () => task('map') },
    {
      id: 'catalogue',
      label: 'Show layers and datasets',
      run: () =>
        session.setState((s) => ({
          ...s,
          catalogueOpen: true,
          panel: 'catalogue',
        })),
    },
    {
      id: 'data',
      label: 'Open attribute table',
      run: () =>
        session.setState((s) => ({
          ...s,
          panel: 'table',
          table: { ...s.table, open: true },
        })),
    },
    {
      id: 'import',
      label: canEdit ? 'Add data / import sources' : 'Switch campus',
      run: () => task('campuses'),
      disabled: blocked,
    },
    {
      id: 'analyze',
      label: 'Analyze data and processing history',
      run: () => task('gis-analyze'),
      disabled: blocked,
    },
    {
      id: 'review',
      label: 'Review issues and submissions',
      run: () => task('gis-review'),
      disabled: blocked,
    },
    {
      id: 'publish',
      label: 'Publish approved snapshots / export map',
      run: () => task('gis-publish'),
      disabled: blocked,
    },
    {
      id: 'settings',
      label: 'Editor appearance and settings',
      run: () => task('settings'),
    },
    ...(capabilities.capabilities.includes('manage')
      ? [
          {
            id: 'members',
            label: 'Campus memberships',
            run: () => task('members'),
            disabled: blocked,
          },
        ]
      : []),
    ...(onSurvey && canEdit
      ? [
          {
            id: 'survey',
            label: 'Survey campus',
            run: onSurvey,
            disabled: blocked,
          },
        ]
      : []),
    ...(onBackup
      ? [{ id: 'recovery', label: 'Download local recovery', run: onBackup }]
      : []),
  ];
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandsOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const status = pending
    ? 'Saving'
    : failure
      ? 'Needs attention'
      : Object.keys(state.attributeDrafts).length
        ? 'Unsaved attributes'
        : saveStatus;
  const css = {
    '--catalogue-width': state.dimensions.catalogue + 'px',
    '--inspector-width': state.dimensions.inspector + 'px',
    '--table-height': state.dimensions.table + 'px',
  } as CSSProperties;
  return (
    <main
      className={
        'editor-shell unified-editor ' +
        (state.catalogueOpen ? 'catalogue-open ' : '') +
        (state.table.open ? 'table-open ' : '') +
        (state.task !== 'map' ? 'task-open ' : '') +
        (surveyActive ? 'survey-active ' : '') +
        (blocked ? 'drawing-active ' : '') +
        (state.expanded ? 'dock-expanded' : '')
      }
      data-panel={state.panel}
      style={css}
    >
      <header className="editor-header unified-header">
        <details className="editor-campus-menu">
          <summary aria-label="Campus menu">
            <strong>TurnRight</strong>
            <span>{campus}</span>
          </summary>
          <div className="editor-card" aria-label="Campus actions">
            <button disabled={blocked} onClick={() => task('campuses')}>
              Switch campus / manage sources
            </button>
            {canEdit && (
              <button disabled={blocked} onClick={() => task('campuses')}>
                Add data
              </button>
            )}
            {capabilities.capabilities.includes('manage') && (
              <button onClick={() => task('members')}>
                Campus memberships
              </button>
            )}
            <button onClick={() => task('settings')}>Settings</button>
          </div>
        </details>
        <button
          className="editor-command-trigger"
          onClick={() => setCommandsOpen(true)}
        >
          Search commands <kbd>Ctrl K</kbd>
        </button>
        <nav aria-label="Editor sections" className="editor-navigation">
          {(
            [
              ['gis-analyze', 'Analyze'],
              ['gis-review', 'Review'],
              ['gis-publish', 'Publish'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              disabled={blocked}
              aria-pressed={
                id === 'gis-review'
                  ? reviewTasks.includes(state.task)
                  : state.task === id
              }
              onClick={() => task(state.task === id ? 'map' : id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <details className="editor-save-menu">
          <summary aria-label="Save and recovery status">
            <output className="editor-save-state" aria-live="polite">
              {!online ? 'Offline · ' : ''}
              {status}
            </output>
          </summary>
          <div className="editor-card">
            <p>
              {failure ||
                (pending
                  ? 'Waiting for pending changes to finish.'
                  : 'Changes are saved to the shared draft. Publication is separate.')}
            </p>
            {Object.keys(state.attributeDrafts).length > 0 && (
              <details className="attribute-recovery-list">
                <summary>
                  Unfinished attribute inputs (
                  {Object.keys(state.attributeDrafts).length})
                </summary>
                <ul>
                  {Object.keys(state.attributeDrafts).map((key) => {
                    const ref = attributeInputReference(key);
                    if (!ref) return null;
                    const [datasetId, feature, field] = ref;
                    return (
                      <li key={key}>
                        <button
                          onClick={() => {
                            session.navigate('map');
                            session.setState((s) => ({
                              ...s,
                              panel: 'table',
                              table: {
                                open: true,
                                kind: 'dataset',
                                id: datasetId,
                              },
                              datasetTables: {
                                ...s.datasetTables,
                                [datasetId]: {
                                  columns:
                                    session.datasets
                                      .find((d) => d.id === datasetId)
                                      ?.schema.fields.map((f) => f.name)
                                      .slice(0, 8) || [],
                                  history: [],
                                  query: { keys: [feature] },
                                },
                              },
                            }));
                          }}
                        >
                          {feature} · {field}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
            <button onClick={onRefresh}>Reconnect and synchronize</button>
            {onBackup && (
              <button onClick={onBackup}>Download local recovery</button>
            )}
            {onExportBackup && (
              <button onClick={onExportBackup}>Export backup</button>
            )}
          </div>
        </details>
        <details className="editor-account-menu">
          <summary aria-label="Account menu">Account</summary>
          <div className="editor-card">
            <small>{capabilities.roles.join(', ')}</small>
            <button onClick={onSignOut}>Sign out</button>
          </div>
        </details>
      </header>
      {reviewTasks.includes(state.task) && (
        <nav className="editor-task-tabs" aria-label="Review views">
          {(
            [
              ['gis-review', 'Issues and submissions'],
              ['draft-changes', 'Draft changes'],
              ['changes', 'Source updates'],
              ['duplicates', 'Duplicates'],
              ['reports', 'Reports'],
            ] as const
          )
            .filter(([id]) => canEdit || id === 'gis-review')
            .map(([id, label]) => (
              <button
                key={id}
                aria-pressed={state.task === id}
                onClick={() => task(id)}
              >
                {label}
              </button>
            ))}
          <button onClick={() => task('map')}>Back to map</button>
        </nav>
      )}
      <div className="editor-dock-controls" aria-label="Workspace panels">
        <button
          onClick={() =>
            session.setState((s) => ({
              ...s,
              catalogueOpen: s.panel === 'catalogue' ? !s.catalogueOpen : true,
              panel: 'catalogue',
            }))
          }
        >
          Layers
        </button>
        <button
          aria-pressed={state.table.open}
          onClick={() =>
            session.setState((s) => ({
              ...s,
              table: {
                ...s.table,
                open: s.panel === 'table' ? !s.table.open : true,
              },
              panel: 'table',
            }))
          }
        >
          Table
        </button>
        {state.selection.length > 0 && (
          <button
            onClick={() =>
              session.setState((s) => ({ ...s, panel: 'inspector' }))
            }
          >
            Properties
          </button>
        )}
        {onSurvey && canEdit && (
          <button onClick={onSurvey} disabled={blocked}>
            Survey
          </button>
        )}
        <button
          aria-pressed={state.expanded}
          onClick={() =>
            session.setState((s) => ({ ...s, expanded: !s.expanded }))
          }
        >
          {state.expanded ? 'Restore panel' : 'Expand panel'}
        </button>
      </div>
      {children}
      {commandsOpen && (
        <Suspense fallback={<output>Opening commands…</output>}>
          <Commands
            commands={commands}
            onClose={() => setCommandsOpen(false)}
          />
        </Suspense>
      )}
    </main>
  );
}
export function DockResize({
  axis,
  dimension,
}: {
  axis: 'horizontal' | 'vertical';
  dimension: 'catalogue' | 'inspector' | 'table';
}) {
  const { state, setState } = useEditorSession();
  const change = (delta: number) =>
    setState((s) => ({
      ...s,
      dimensions: {
        ...s.dimensions,
        [dimension]: Math.max(
          dimension === 'table' ? 180 : dimension === 'inspector' ? 300 : 240,
          Math.min(
            dimension === 'table' ? 600 : dimension === 'catalogue' ? 380 : 540,
            s.dimensions[dimension] + delta,
          ),
        ),
      },
    }));
  // A focusable window splitter needs keyboard and pointer interaction.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex
  return (
    <hr
      tabIndex={0}
      aria-label={'Resize ' + dimension}
      aria-orientation={axis === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-valuenow={state.dimensions[dimension]}
      className={'editor-dock-resize ' + axis}
      onKeyDown={(e) => {
        if (
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        ) {
          e.preventDefault();
          change(
            (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) *
              (dimension === 'catalogue' ? 1 : -1) *
              20,
          );
        }
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const element = e.currentTarget;
        element.setPointerCapture(e.pointerId);
        let previous = axis === 'horizontal' ? e.clientX : e.clientY;
        const move = (event: PointerEvent) => {
          const next = axis === 'horizontal' ? event.clientX : event.clientY;
          change((next - previous) * (dimension === 'catalogue' ? 1 : -1));
          previous = next;
        };
        const end = () => {
          element.removeEventListener('pointermove', move);
          element.removeEventListener('pointerup', end);
          element.removeEventListener('pointercancel', end);
          element.removeEventListener('lostpointercapture', end);
        };
        element.addEventListener('pointermove', move);
        element.addEventListener('pointerup', end);
        element.addEventListener('pointercancel', end);
        element.addEventListener('lostpointercapture', end);
      }}
    />
  );
}
