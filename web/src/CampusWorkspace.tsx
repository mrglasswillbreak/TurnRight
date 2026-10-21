import {
  Building2,
  Check,
  ChevronRight,
  Globe2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useCampusWorkspace,
  type CampusWorkspaceProps,
} from './useCampusWorkspace';
import { CampusCreateForm } from './CampusCreateForm';
import { CampusImportJob } from './CampusImportJob';
import { CampusSources } from './CampusSources';
import './campus-workspace.css';
export default function CampusWorkspace(props: CampusWorkspaceProps) {
  const state = useCampusWorkspace(props);
  const {
    onClose,
    query,
    setQuery,
    setCreating,
    setJob,
    setAdding,
    campuses,
    current,
    run,
    onSwitch,
    busy,
    error,
    notice,
    creating,
    job,
  } = state;
  return (
    <section className="campus-workspace" aria-label="Campuses workspace">
      <header className="campus-workspace-header">
        <div>
          <span className="editor-eyebrow">PRIVATE WORKSPACE</span>
          <h2>
            <Globe2 size={23} /> Campuses
          </h2>
          <p>Import, review and publish each campus independently.</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close campuses"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div className="campus-workspace-body">
        <aside className="campus-directory">
          <label className="campus-search">
            <Search size={17} />
            <input
              aria-label="Search campuses"
              placeholder="Search campuses"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Button
            className="w-full"
            onClick={() => {
              setCreating(true);
              setJob(null);
              setAdding(false);
            }}
          >
            <Plus /> New campus
          </Button>
          <div className="campus-directory-list">
            {campuses
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <button
                  key={c.id}
                  className={c.id === current.id ? 'selected' : ''}
                  aria-current={c.id === current.id ? 'page' : undefined}
                  onClick={() => void run(() => onSwitch(c))}
                  disabled={busy}
                >
                  <span className="campus-list-icon">
                    <Building2 size={19} />
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>/{c.slug}</small>
                  </span>
                  {c.id === current.id ? (
                    <Check size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              ))}
          </div>
          <p className="small-note">
            Published campuses appear in the public map switcher. Unpublished
            imports stay private.
          </p>
        </aside>
        <main className="campus-content">
          {error && (
            <p role="alert" className="campus-error">
              {error}
            </p>
          )}
          {notice && <output className="campus-notice">{notice}</output>}
          {creating ? (
            <CampusCreateForm state={state} />
          ) : job ? (
            <CampusImportJob state={state} />
          ) : (
            <CampusSources state={state} />
          )}
        </main>
      </div>
    </section>
  );
}
