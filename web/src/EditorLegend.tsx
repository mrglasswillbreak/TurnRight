import { ListFilter, X } from 'lucide-react';
export function EditorLegend({
  open,
  onChange,
  threeD,
}: {
  open: boolean;
  onChange: (value: boolean) => void;
  threeD: boolean;
}) {
  return open ? (
    <div className="editor-legend editor-card" aria-label="Map legend">
      <strong>Map legend</strong>
      <button
        className="editor-icon legend-close"
        aria-label="Close map legend"
        onClick={() => onChange(false)}
      >
        <X size={15} />
      </button>
      <span>
        <i className="new" />
        New
      </span>
      <span>
        <i className="modified" />
        Modified
      </span>
      <span>
        <i className="incomplete" />
        Needs attention
      </span>
      {threeD && <small>Muted 3D blocks = height unknown</small>}
    </div>
  ) : (
    <button
      className="editor-card legend-toggle"
      aria-label="Map legend"
      title="Map legend"
      onClick={() => onChange(true)}
    >
      <ListFilter size={18} />
    </button>
  );
}
