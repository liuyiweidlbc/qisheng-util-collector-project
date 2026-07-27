import { KEYS, KEEPALIVE_PHASE_ENTER } from './storage-keys.js';

export { KEEPALIVE_PHASE_ENTER };

export function getKeepalivePhase() {
  try {
    const p = sessionStorage.getItem(KEYS.KEEPALIVE_PHASE) || '';
    if (p === 'via-football' || p === 'returning' || p === 'going-list') {
      sessionStorage.setItem(KEYS.KEEPALIVE_PHASE, KEEPALIVE_PHASE_ENTER);
      return KEEPALIVE_PHASE_ENTER;
    }
    return p === KEEPALIVE_PHASE_ENTER ? KEEPALIVE_PHASE_ENTER : '';
  } catch (e) {
    return '';
  }
}

export function setKeepalivePhaseEnter() {
  try {
    sessionStorage.setItem(KEYS.KEEPALIVE_PHASE, KEEPALIVE_PHASE_ENTER);
  } catch (e) { /* ignore */ }
}

export function clearKeepalivePhase() {
  try {
    sessionStorage.removeItem(KEYS.KEEPALIVE_PHASE);
  } catch (e) { /* ignore */ }
}

export function isKeepaliveEnterMatchPhase() {
  return getKeepalivePhase() === KEEPALIVE_PHASE_ENTER;
}
