import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { convertBrowserEntry } from '../../scripts/browser-coverage-entry.mjs';
import { collectBrowserEntry } from '../../scripts/browser-coverage-merge.mjs';

describe('browser coverage evidence', () => {
  it('unions separate executions without conflating changed source at the same URL', () => {
    const entries = new Map();
    const entry = (counts: number[], query = '') => ({
      url: `http://127.0.0.1/src/example.ts${query}`,
      source: 'function a() { return 1; } function b() { return 2; }',
      functions: counts.map((count, index) => ({
        functionName: index ? 'b' : 'a',
        isBlockCoverage: true,
        ranges: [
          { startOffset: index * 25, endOffset: (index + 1) * 25, count },
        ],
      })),
    });
    collectBrowserEntry(entries, entry([1, 0]));
    collectBrowserEntry(entries, entry([0, 2], '?reload=1'));
    expect(entries.size).toBe(1);
    expect(
      [...entries.values()][0].coverage.functions.map(
        (fn: { ranges: { count: number }[] }) => fn.ranges[0].count,
      ),
    ).toEqual([1, 2]);
    collectBrowserEntry(entries, {
      ...entry([0, 0]),
      source: 'different source',
    });
    expect(entries.size).toBe(2);
  });
  it('maps transformed browser execution back to the original TypeScript', async () => {
    const original =
      'type Count = number;\nfunction double(value: Count) {\n  return value * 2;\n}\ndouble(3);\n';
    const compiled = ts.transpileModule(original, {
      fileName: 'coverage-example.ts',
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        inlineSourceMap: true,
        inlineSources: true,
      },
    }).outputText;
    const report = await convertBrowserEntry({
      url: 'http://127.0.0.1:5183/src/coverage-example.ts?t=123',
      source: compiled,
      functions: [
        {
          functionName: '',
          isBlockCoverage: true,
          ranges: [{ startOffset: 0, endOffset: compiled.length, count: 1 }],
        },
      ],
    });
    const files = Object.values(report);
    expect(files).toHaveLength(1);
    const file = files[0];
    expect(file.path.replaceAll('\\', '/')).toMatch(
      /\/web\/src\/coverage-example\.ts$/,
    );
    const functions = Object.values(file.fnMap);
    expect(functions).toHaveLength(1);
    expect(functions[0].decl.start.line).toBe(2);
    expect(
      Object.values(file.statementMap).every(
        (statement) => statement.start.line > 1,
      ),
    ).toBe(true);
    expect(Object.values(file.f)).toEqual([1]);
  });

  it('never credits a synthetic replacement or dependency to authored source', async () => {
    const replacement = {
      source: 'throw new Error("synthetic failure")',
      functions: [],
    };
    expect(
      await convertBrowserEntry({
        ...replacement,
        url: 'http://127.0.0.1/src/App.tsx',
      }),
    ).toEqual({});
    expect(
      await convertBrowserEntry({
        ...replacement,
        url: 'http://127.0.0.1/node_modules/react.js',
      }),
    ).toEqual({});
  });
});
