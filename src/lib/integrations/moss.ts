import type { RetrievalDocument, RetrievalHit } from "../retrieval";
import { RETRIEVAL_TOP_K } from "../retrieval";

export type MossSearchResult = {
  hits: RetrievalHit[];
  queryMs: number;
  totalMs: number;
};

// Node-only: the official SDK contains a native runtime; never import it into a browser bundle.
export async function searchMoss(
  config: { projectId: string; projectKey: string },
  sessionName: string,
  documents: RetrievalDocument[],
  query: string,
): Promise<MossSearchResult> {
  const started = performance.now();
  const { MossClient } = await import("@moss-js/moss");
  const client = new MossClient(config.projectId, config.projectKey, {
    cachePath: "/tmp/attest-moss",
  });
  try {
    const session = await client.session(sessionName);
    // A fresh, request-scoped session prevents cross-sandbox retrieval and stale cloud copies.
    // Nothing is pushed to a Moss cloud index; Convex retains the authoritative corpus.
    await session.addDocs(
      documents.map((d) => ({ id: d.id, text: `${d.title}\n${d.text}` })),
    );
    const queryStart = performance.now();
    const result = await session.query(query, {
      topK: RETRIEVAL_TOP_K,
      alpha: 0.8,
    });
    return {
      hits: result.docs.map((d) => ({ id: d.id, score: d.score })),
      queryMs: Math.round(performance.now() - queryStart),
      totalMs: Math.round(performance.now() - started),
    };
  } finally {
    await client.close();
  }
}
