type EvidenceSnapshots<T extends { id: string }> = {
  case: { input: { sources: T[] } };
  proposals: { _id: string; input: { sources: T[] } }[];
};

/** Prefer the event's immutable proposal; later appended evidence remains openable. */
export function resolveAuditEvidence<T extends { id: string }>(
  detail: EvidenceSnapshots<T>,
  sourceId: string,
  proposalId?: string,
) {
  if (!proposalId)
    return detail.case.input.sources.find((s) => s.id === sourceId);
  const proposal = detail.proposals.find((p) => p._id === proposalId);
  if (!proposal) return undefined;
  return (
    proposal.input.sources.find((s) => s.id === sourceId) ??
    detail.case.input.sources.find((s) => s.id === sourceId)
  );
}
