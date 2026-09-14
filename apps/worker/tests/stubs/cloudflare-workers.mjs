// The Durable Object base class, stubbed. The DOs themselves are tested by their own suites; this
// exists only so index.ts can be bundled and its ROUTES executed in Node.
export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
