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
  firstPosition,
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
    for (const message of result.errors) {
      const edit = edits.find(
        (e) =>
          message.includes(e.id) ||
          (typeof e.properties.name === 'string' &&
            e.properties.name.length > 3 &&
            message.startsWith(e.properties.name)),
      );
      issues.push({
        code: 'edit-validation',
        phase: 'edits',
        message,
        featureId: edit?.id,
        coordinates:
          edit && 'coordinates' in edit.geometry
            ? firstPosition(edit.geometry.coordinates)
            : undefined,
      });
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
