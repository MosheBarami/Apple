export const calls = [];
export let answer = { assetId: 4242 };
export function setAnswer(a) { answer = a; }
export async function uploadToOwnRoblox(env, userId, bytes, contentType, type, name) {
  calls.push({ userId, bytes: bytes.length, contentType, type, name });
  return answer;
}
