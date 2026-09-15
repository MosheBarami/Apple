// Which family of documentation a RobloxQA question is grounded in.
//
// WHY A SEPARATE MODULE. The harvester counts buckets when it writes the dataset card; the scorer
// uses them to split the headline number from the secondary one and to drop the stale slice. If
// the two had their own copies they would drift, and the card would then describe a partition the
// scorer does not use — which is the quiet way a reported subset stops being the subset that was
// scored.
//
// THE BUCKETS, AND WHY THEY ARE NOT ALL EQUAL:
//   referenceEngine  the engine API reference — classes, properties, methods, events. 49% of the
//                    dataset and the only part that directly tests what the product needs to know.
//   luau             the Luau language reference. Small (about 1.4%) but the same kind of thing,
//                    so it joins the headline.
//   education        lesson plans and tutorials. These ask about Studio UI and pedagogy — "the
//                    primary purpose of publishing a place to test it" — and move independently of
//                    engine knowledge. Reported beside the headline, never inside it.
//   cloudLegacy      Open Cloud v1 pages that no longer exist in Roblox's live documentation. The
//                    "correct" answer documents a withdrawn product, so these rows are DROPPED
//                    rather than merely reported: a model that has learnt the current API is
//                    penalised for being right.
//   otherDocs        everything else under the creator docs — guides, art, monetisation, analytics.
export function bucketOfGroundingDoc(groundingDocId) {
  const d = String(groundingDocId ?? '');
  if (/^luau-docs:/.test(d)) return 'luau';
  if (/\/cloud\/legacy\//.test(d)) return 'cloudLegacy';
  if (/\/reference\/engine\//.test(d)) return 'referenceEngine';
  if (/\/(education|tutorials?)\//.test(d)) return 'education';
  return 'otherDocs';
}

export const BUCKETS = ['referenceEngine', 'luau', 'education', 'cloudLegacy', 'otherDocs'];
