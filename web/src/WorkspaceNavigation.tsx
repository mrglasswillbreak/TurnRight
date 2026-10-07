import {
  editorWorkspaces,
  workspaceForSection,
  type EditorSection,
} from './editor-layout';
export function WorkspaceNavigation({
  section,
  onSelect,
  disabled = false,
  canEdit = true,
}: {
  section: string;
  onSelect: (section: EditorSection) => void;
  disabled?: boolean;
  canEdit?: boolean;
}) {
  const options = editorWorkspaces.filter(([id]) => canEdit || id !== 'map');
  const current = workspaceForSection(section);
  return (
    <>
      <nav className="editor-navigation" aria-label="Editor sections">
        {options.map(([id, label]) => (
          <button
            key={id}
            className={current === id ? 'active' : ''}
            aria-current={current === id ? 'page' : undefined}
            disabled={disabled}
            onClick={() => onSelect(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <select
        className="workspace-mobile-switch"
        aria-label="Workspace"
        value={current}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value as EditorSection)}
      >
        {options.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </>
  );
}
const groups: Record<string, [EditorSection, string][]> = {
  'gis-data': [
    ['gis-data', 'Datasets'],
    ['campuses', 'Imports'],
  ],
  map: [
    ['map', 'Features'],
    ['layers', 'Layers'],
  ],
  'gis-analyze': [],
  'gis-review': [
    ['gis-review', 'Overview'],
    ['changes', 'Sources'],
    ['duplicates', 'Duplicates'],
    ['reports', 'Reports'],
  ],
  'gis-publish': [
    ['gis-publish', 'Approved snapshots'],
    ['releases', 'Releases'],
  ],
};
export function WorkspaceSections({
  section,
  onSelect,
  disabled,
  canEdit = true,
}: {
  section: string;
  onSelect: (section: EditorSection) => void;
  disabled?: boolean;
  canEdit?: boolean;
}) {
  return (
    <nav aria-label="Workspace tools">
      {(groups[workspaceForSection(section)] || [])
        .filter(([id]) => canEdit || id.startsWith('gis-'))
        .map(([id, label]) => (
          <button
            key={id}
            aria-pressed={section === id}
            disabled={disabled}
            onClick={() => onSelect(id)}
          >
            {label}
          </button>
        ))}
    </nav>
  );
}
