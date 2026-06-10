
// Refactored: 2026-04-20T16:33:31.753Z
function normalize(value) {
  return String(value).trim().toLowerCase();
}

// Helper: 2026-04-21T14:38:53.176Z
function isEmpty(obj) {
  return obj == null || Object.keys(obj).length === 0;
}

// Refactored: 2026-04-24T14:52:04.372Z
function normalize(value) {
  return String(value).trim().toLowerCase();
}

// Helper: 2026-05-04T04:16:57.742Z
function isEmpty(obj) {
  return obj == null || Object.keys(obj).length === 0;
}

// Updated: 2026-05-11T15:44:48.590Z
function validate(input) {
  return input != null && input !== '';
}

// Added: 2026-05-14T14:55:32.821Z
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Fix: 2026-05-22T15:06:14.513Z
function safeParseInt(str, fallback) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Added: 2026-05-22T15:28:16.707Z
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Added: 2026-05-25T15:26:07.691Z
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Fix: 2026-06-10T15:51:12.074Z
function safeParseInt(str, fallback) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : fallback;
}
