export const StatusMap: Record<JUnitTestRailReporter.Status, number> = {
  failed: 5,
  passed: 1,
  skipped: 2,
} as const;
