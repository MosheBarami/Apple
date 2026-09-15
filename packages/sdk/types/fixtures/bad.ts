// A WRONG consumer. Every line marked below MUST be a compile error.
//
// This file is the half of the type test that can actually fail. A fixture that only
// compiled correct code would pass against a declaration file full of `any` — which is
// exactly the shape of "a test that measured nothing".
import { AppleClient, SessionStream, type Memory } from '../index';

const client = new AppleClient({ baseUrl: 'https://api.test', token: 'jwt' });

// ERROR: 'pro' is not a PlanId.
export const wrongPlan = client.startCheckout('pro');

// ERROR: memory.facts is string[], not string.
export const wrongMemory: Memory = { summary: null, facts: 'the door is red' };

// ERROR: limit is a number.
export const wrongLimit = client.messages('id', { limit: 'twenty' });

// ERROR: there is no such method.
export const noSuchMethod = client.deleteEverything();

// ERROR: 'granite' is not a GolemMode.
export const wrongMode = new SessionStream({ baseUrl: 'x', projectId: 'y', token: 'z' }).sendChat('hi', 'granite');

// ERROR: a SessionStream needs a token.
export const noToken = new SessionStream({ baseUrl: 'x', projectId: 'y' });
