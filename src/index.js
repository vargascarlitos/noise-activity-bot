
// Helper: 2026-04-21T15:19:55.469Z
function isEmpty(obj) {
  return obj == null || Object.keys(obj).length === 0;
}

// Added: 2026-04-21T15:46:57.689Z
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
