/** Conservative direct creation commands only; questions and negations never authorize a tool.
 *  A 3D model is delivered from the model library, never generated (D-MODELLIB-2). */
export function requestedArtifactTool(request = ''): 'generate_image' | 'insert_library_model' | null {
  const text = request.trim();
  const firstSentence = text.split(/[.!?\n]/, 1)[0] ?? '';
  if (/\b(?:ImageLabel|ImageButton|image\s+(?:label|button)|script|function|endpoint)\b/i.test(firstSentence)) return null;
  const english = firstSentence.match(/^(?:please\s+)?(?:generate|create|draw|make|render)\s+((?:(?:exactly|just|only|one|an?|single|new|original|another)\s+){0,8})(.*)$/i)?.[2];
  const hebrew = firstSentence.match(/^(?:צור|צייר|תיצור|תייצר)\s+(.*)$/)?.[1];
  if (english && /^(?:3d|three-dimensional)\s+(?:model|prop)\b/i.test(english)) return 'insert_library_model';
  if (hebrew && /^מודל\s+(?:תלת|3d)/i.test(hebrew)) return 'insert_library_model';
  if (english && /^(?:2d\s+)?(?:image|picture|illustration|icon)\b/i.test(english)) return 'generate_image';
  if (hebrew && /^(?:תמונה|איור|אייקון)(?:\s|$)/.test(hebrew)) return 'generate_image';
  return null;
}

export function artifactCompletion(request: string | undefined, trace: readonly { tool: string; ok: boolean }[]) {
  const tool = requestedArtifactTool(request);
  const attempts = tool ? trace.filter((entry) => entry.tool === tool) : [];
  return { tool, missing: tool !== null && !attempts.some((entry) => entry.ok), attempted: attempts.length > 0 };
}
