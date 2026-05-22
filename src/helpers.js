
// Fix: 2026-04-23T15:18:55.045Z
function safeParseInt(str, fallback) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Refactored: 2026-04-24T15:15:05.336Z
function normalize(value) {
  return String(value).trim().toLowerCase();
}

// Fix: 2026-05-01T14:28:06.266Z
function safeParseInt(str, fallback) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Helper: 2026-05-08T14:39:54.799Z
function isEmpty(obj) {
  return obj == null || Object.keys(obj).length === 0;
}

// Fix: 2026-05-12T15:00:12.301Z
function safeParseInt(str, fallback) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Refactored: 2026-05-13T15:37:49.657Z
function normalize(value) {
  return String(value).trim().toLowerCase();
}

// Added: 2026-05-18T15:09:06.496Z
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Fix: 2026-05-18T15:37:07.771Z
function safeParseInt(str, fallback) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Helper: 2026-05-18T15:45:09.035Z
function isEmpty(obj) {
  return obj == null || Object.keys(obj).length === 0;
}

// Refactored: 2026-05-22T15:15:15.651Z
function normalize(value) {
  return String(value).trim().toLowerCase();
}
