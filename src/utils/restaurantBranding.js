const PENDING_BRANDING_KEY = "teresita.pendingBranding";
const BRANDING_PREFIX = "teresita.branding.";

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value || fallback;
  } catch {
    return fallback;
  }
}

export function savePendingBranding(branding) {
  try {
    localStorage.setItem(PENDING_BRANDING_KEY, JSON.stringify(branding));
  } catch {
    // Large images are optional; onboarding should still work without one.
  }
}

export function applyPendingBranding(companyId) {
  if (!companyId) return null;
  const pending = readJson(PENDING_BRANDING_KEY);
  if (!pending) return readBranding(companyId);
  try {
    localStorage.setItem(`${BRANDING_PREFIX}${companyId}`, JSON.stringify(pending));
    localStorage.removeItem(PENDING_BRANDING_KEY);
  } catch {
    return pending;
  }
  return pending;
}

export function readBranding(companyId) {
  if (!companyId) return null;
  return readJson(`${BRANDING_PREFIX}${companyId}`);
}
