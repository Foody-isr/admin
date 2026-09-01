import type { PreviewDevice } from "./types";

export type PreviewAcknowledgement = {
  revision: number;
  contentRevision: number;
  activePageKey: string;
  device: PreviewDevice;
};

export type PreviewAcknowledgements = Record<
  PreviewDevice,
  PreviewAcknowledgement | null
>;

export type PreviewExpectedRevisions = Record<PreviewDevice, number | null>;

/**
 * Lists the previews the editor is waiting on: every device that has been
 * opened at least once and has not since acknowledged the current content.
 *
 * A device only counts once it has been requested, so someone who never leaves
 * the desktop preview is never asked about mobile. But once mobile HAS been
 * opened, every later content edit stales it again — it can only re-acknowledge
 * while it is on screen, so the publish gate names it rather than going quiet.
 */
export function stalePreviewDevices(
  acknowledgements: PreviewAcknowledgements,
  expectedRevisions: PreviewExpectedRevisions,
  contentRevision: number,
  activePageKey: string,
): PreviewDevice[] {
  const requestedDevices = (["desktop", "mobile"] as const).filter(
    (device) => expectedRevisions[device] !== null,
  );
  if (requestedDevices.length === 0) return ["desktop"];
  return requestedDevices.filter((device) => {
    const acknowledgement = acknowledgements[device];
    const expectedRevision = expectedRevisions[device];
    return !(
      acknowledgement?.revision === expectedRevision &&
      acknowledgement?.contentRevision === contentRevision &&
      acknowledgement.activePageKey === activePageKey
    );
  });
}

/** Returns true when every preview device requested by the editor is current. */
export function hasCompletePreviewCoverage(
  acknowledgements: PreviewAcknowledgements,
  expectedRevisions: PreviewExpectedRevisions,
  contentRevision: number,
  activePageKey: string,
): boolean {
  return (
    stalePreviewDevices(
      acknowledgements,
      expectedRevisions,
      contentRevision,
      activePageKey,
    ).length === 0
  );
}

/** Keeps only monotonic acknowledgements for the device that emitted them. */
export function recordPreviewAcknowledgement(
  acknowledgements: PreviewAcknowledgements,
  acknowledgement: PreviewAcknowledgement,
): PreviewAcknowledgements {
  const current = acknowledgements[acknowledgement.device];
  if (current && current.revision > acknowledgement.revision) {
    return acknowledgements;
  }
  return {
    ...acknowledgements,
    [acknowledgement.device]: acknowledgement,
  };
}
