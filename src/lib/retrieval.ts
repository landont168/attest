import type { LearningContext } from "./finance/learning";

export const RETRIEVAL_VERSION = "moss-evidence-v1";
export const RETRIEVAL_TOP_K = 6;
export type RetrievalDocument = {
  id: string;
  kind: "precedent" | "source";
  code: string;
  title: string;
  text: string;
  version: string;
  synthetic: boolean;
};
export type RetrievalHit = { id: string; score: number };

// Provider text and metadata are never trusted; resolve identifiers against both snapshots.
export function validateHits(
  hits: RetrievalHit[],
  original: RetrievalDocument[],
  current: RetrievalDocument[],
) {
  const seen = new Set<string>();
  return hits.slice(0, RETRIEVAL_TOP_K).flatMap((hit) => {
    const doc = original.find((d) => d.id === hit.id);
    const now = current.find((d) => d.id === hit.id);
    if (
      !doc ||
      !now ||
      seen.has(hit.id) ||
      !Number.isFinite(hit.score) ||
      doc.kind !== now.kind ||
      doc.code !== now.code ||
      doc.title !== now.title ||
      doc.text !== now.text ||
      doc.version !== now.version ||
      doc.synthetic !== now.synthetic
    )
      return [];
    seen.add(hit.id);
    return [{ ...hit, document: doc }];
  });
}

export function selectLearningContext(
  context: LearningContext,
  codes: string[],
): LearningContext {
  const required = new Set(context.corrections.map((c) => `PREC-${c.code}`));
  const selected = [...new Set([...codes, ...required])];
  return {
    ...context,
    precedents: [
      ...selected.flatMap((code) =>
        context.precedents.filter((p) => p.active && p.code === code),
      ),
      // Safety counterexamples are always supplied, regardless of similarity rank.
      ...context.precedents.filter((p) => !p.active),
    ],
  };
}
