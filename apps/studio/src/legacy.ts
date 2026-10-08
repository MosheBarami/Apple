import { DurableObject } from 'cloudflare:workers';

/**
 * The Flue agent's Durable Object class (rebuild R3), kept as an empty class so its stored conversations are not
 * deleted with it: CLAUDE.md holds data for 7 days after its replacement is verified. Remove it, with a
 * `deleted_classes` migration, after that.
 */
export class FlueStudPilotAgent extends DurableObject {}
