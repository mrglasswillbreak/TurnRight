import {
  assembleSources,
  applyEdits,
  type SourceRecord,
} from './editor-model.js';
import {
  findDuplicateCandidates,
  type DuplicateCandidate,
} from './duplicates.js';
import {
  structuralIssues,
  type ValidationIssue,
  type ValidationPhase,
} from './validation.js';
import type { CampusData, MapEdit } from './types.js';

export interface EditorValidation {
  data: CampusData;
  errors: string[];
  warnings: string[];
  duplicates: DuplicateCandidate[];
  issues: ValidationIssue[];
  revision: number;
  failed: boolean;
  usable: boolean;
}
export function assembleEditorSources(
  records: SourceRecord[],
  fallback: CampusData,
) {
  try {
    return {
      data: assembleSources(records, fallback),
      issues: [] as ValidationIssue[],
    };
  } catch (error) {
    return {
      data: fallback,
      issues: [
        {
          code: 'source-assembly',
          phase: 'sources' as const,
          message:
            error instanceof Error
              ? error.message
              : 'Could not assemble approved sources.',
        },
      ],
    };
  }
}
export function validateWorkspace(
  base: CampusData,
  edits: MapEdit[],
  revision = 0,
  sourceIssues: ValidationIssue[] = [],
): EditorValidation {
  let phase: ValidationPhase = 'sources';
  let issues = [...sourceIssues, ...structuralIssues(base)];
  const blocked = (failed = false): EditorValidation => ({
    data: base,
    errors: issues.map((i) => i.message),
    warnings: [],
    duplicates: [],
    issues,
    revision,
    failed,
    usable: false,
  });
  if (issues.length) return blocked();
  try {
    const result = applyEdits(base, edits, (next) => {
      phase = next;
    });
    issues = structuralIssues(result.data, 'topology');
    if (issues.length) return blocked();
    issues = [...result.issues];
    for (const message of result.errors) {
      if (!issues.some((i) => i.message === message))
        issues.push({ code: 'edit-validation', phase: 'edits', message });
    }
    phase = 'duplicates';
    return {
      ...result,
      issues,
      revision,
      failed: false,
      usable: true,
      duplicates: findDuplicateCandidates(result.data, edits),
    };
  } catch (error) {
    issues = [
      {
        code: 'validation-crash',
        phase,
        message: `Validation stopped during ${phase}: ${error instanceof Error ? error.message : 'Unexpected failure'}`,
      },
    ];
    return blocked(true);
  }
}
