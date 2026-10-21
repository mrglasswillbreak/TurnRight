export const coverageIncludes: string[];
export const coverageExcludes: string[];
export function coveredSource(file: string): boolean;
export function coverageSnapshot(): Promise<string>;
