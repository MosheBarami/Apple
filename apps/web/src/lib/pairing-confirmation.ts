/** Facts captured before a pairing code is minted. */
export interface PairingAttemptBaseline {
  studioConnected: boolean;
  diagnosticsKnown: boolean;
  pairedAt: number | null;
  lastSeenAt: number | null;
}

/** The diagnostics fields that can tie an already-live socket to a newly claimed code. */
export interface PairingAttemptObservation {
  pairedAt: number | null;
  connected: boolean;
  lastSeenAt: number | null;
}

/**
 * Decide whether the Studio connection observed now belongs to the code minted after `baseline`.
 *
 * A first pairing has a useful edge: the live bridge signal was false before the code and is true
 * now. A replacement does not. Its old Studio may keep `studioConnected` true until the new Studio
 * claims the code, so the boolean alone cannot prove which Studio owns the project. For that case
 * the connection record must also show a new token issue time and a heartbeat at or after it.
 */
export function pairingAttemptConnected(
  baseline: PairingAttemptBaseline,
  studioConnected: boolean,
  observation: PairingAttemptObservation | null,
): boolean {
  if (!studioConnected) return false;
  // An offline existing Studio can reconnect using its old token while a replacement code is
  // visible. Only a positively observed never-paired project has a first-connection shortcut.
  if (!baseline.studioConnected && baseline.diagnosticsKnown && baseline.pairedAt === null) return true;
  if (!baseline.diagnosticsKnown || observation === null) return false;

  const { pairedAt, connected, lastSeenAt } = observation;
  if (!connected || pairedAt === null || lastSeenAt === null) return false;
  if (!Number.isFinite(pairedAt) || !Number.isFinite(lastSeenAt) || pairedAt <= 0 || lastSeenAt <= 0) return false;
  if (baseline.pairedAt !== null && pairedAt <= baseline.pairedAt) return false;
  if (baseline.lastSeenAt !== null && lastSeenAt <= baseline.lastSeenAt) return false;
  return lastSeenAt >= pairedAt;
}
