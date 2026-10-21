import { useState } from 'react';
import type { QualityIssue } from './gis-types';
export function IssueComment({
  issue,
  save,
}: {
  issue: QualityIssue;
  save: (issue: QualityIssue) => Promise<unknown>;
}) {
  const [text, setText] = useState(''),
    [url, setUrl] = useState(''),
    [label, setLabel] = useState('');
  return (
    <>
      <label>
        Comment
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
        />
      </label>
      <label>
        Evidence URL
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Evidence label
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button
        disabled={!text.trim()}
        onClick={async () => {
          await save({
            ...issue,
            comments: [...issue.comments, { actor: '', text, createdAt: '' }],
            evidence: url
              ? [...issue.evidence, { label: label || 'Evidence', url }]
              : issue.evidence,
          });
          setText('');
          setUrl('');
        }}
      >
        Add comment / evidence
      </button>
    </>
  );
}
