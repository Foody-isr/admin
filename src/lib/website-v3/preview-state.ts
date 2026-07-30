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

/** Returns true only when both preview devices rendered the current page state. */
export function hasCompletePreviewCoverage(
  acknowledgements: PreviewAcknowledgements,
  expectedRevisions: PreviewExpectedRevisions,
  contentRevision: number,
  activePageKey: string,
): boolean {
  return (["desktop", "mobile"] as const).every((device) => {
    const acknowledgement = acknowledgements[device];
    const expectedRevision = expectedRevisions[device];
    return (
      expectedRevision !== null &&
      acknowledgement?.revision === expectedRevision &&
      acknowledgement?.contentRevision === contentRevision &&
      acknowledgement.activePageKey === activePageKey
    );
  });
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
