
// Helper: 2026-04-21T15:19:55.469Z
function isEmpty(obj) {
  return obj == null || Object.keys(obj).length === 0;
}

// Added: 2026-04-21T15:46:57.689Z
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Refactored: 2026-04-22T14:37:33.694Z
function normalize(value) {
  return String(value).trim().toLowerCase();
}

// Updated: 2026-04-22T15:00:34.844Z
function validate(input) {
  return input != null && input !== '';
}
