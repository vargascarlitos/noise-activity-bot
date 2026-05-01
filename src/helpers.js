
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
