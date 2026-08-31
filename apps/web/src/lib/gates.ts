// Pulling the honest bits out of a tool's structured result.
//
// `tool_end.detail` is untrusted: it only ever reaches the UI after the
// generative-UI validator has accepted it, which is what `panelFromTool`
// already does. These helpers read the *validated* document, so nothing here
// can be fed a shape the schema does not describe.
//
// Two things are extracted:
//
//   * gate results — a visual critique or a test report the worker actually
//     ran. These become the Thinking card's Validation stage. A critique the
//     worker could not run (`unavailable`) is deliberately skipped: "the gate
//     did not produce a result" is not a result.
//   * upcoming steps — `build_plan` steps the worker explicitly marked
//     `pending` or `blocked`. These are the ONLY legitimate source of a pending
//     bullet in the Actions checklist; everything else is a real tool event.
import type { GateRow, PlannedStep } from '../components/ws/thinking-model';
import type { UIDocument } from './generative-ui/schema';

export interface ValidatedDoc {
  id: string;
  doc: UIDocument;
}

export function gatesFromDocs(docs: ValidatedDoc[]): GateRow[] {
  const gates: GateRow[] = [];
  for (const { id, doc } of docs) {
    doc.blocks.forEach((block, i) => {
      if (block.type === 'visual_critique') {
        if (block.unavailable) return;
        gates.push({
          key: `${id}:${i}`,
          label: 'Visual quality gate',
          passed: block.passed,
          score: typeof block.score === 'number' ? block.score : undefined,
          detail: block.summary || undefined,
        });
        return;
      }
      if (block.type === 'test_report') {
        const parts = [`${block.passed} passed`, `${block.failed} failed`];
        if (typeof block.skipped === 'number' && block.skipped > 0) parts.push(`${block.skipped} skipped`);
        gates.push({
          key: `${id}:${i}`,
          label: block.title ?? 'Playtest',
          passed: block.failed === 0,
          detail: parts.join(' · '),
        });
      }
    });
  }
  return gates;
}

export function plannedStepsFromDocs(docs: ValidatedDoc[]): PlannedStep[] {
  const steps: PlannedStep[] = [];
  for (const { id, doc } of docs) {
    doc.blocks.forEach((block, i) => {
      if (block.type !== 'build_plan') return;
      block.steps.forEach((step, j) => {
        if (step.status !== 'pending' && step.status !== 'blocked') return;
        steps.push({ key: `${id}:${i}:${j}`, title: step.title, detail: step.detail });
      });
    });
  }
  return steps;
}
