/** A truncated delegate must fail instead of returning Flue's "completed with no text". */
export function guardModelStream(response: Response): Response {
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  )
    return response;
  const decoder = new TextDecoder();
  let pending = "";
  let meaningful = false;
  const inspect = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data.trim() === "[DONE]") return;
    let chunk: {
      choices?: {
        delta?: { content?: unknown; tool_calls?: unknown[] };
        finish_reason?: string | null;
      }[];
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    } // The provider reports malformed frames itself.
    for (const choice of chunk.choices ?? []) {
      if (
        typeof choice.delta?.content === "string" &&
        choice.delta.content.trim()
      )
        meaningful = true;
      if (choice.delta?.tool_calls?.length) meaningful = true;
      if (choice.finish_reason === "length") {
        throw new Error(
          "The AI reached its response limit before completing this step. Try a smaller change."
        );
      }
      if (choice.finish_reason === "stop" && !meaningful) {
        throw new Error(
          "The AI returned no answer or tool call for this step. The task did not complete."
        );
      }
    }
  };
  const drain = () => {
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(pending))) {
      inspect(pending.slice(0, boundary.index));
      pending = pending.slice(boundary.index + boundary[0].length);
    }
  };
  return new Response(
    response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(bytes, controller) {
          pending += decoder.decode(bytes, { stream: true });
          drain();
          controller.enqueue(bytes);
        },
        flush() {
          pending += decoder.decode();
          drain();
          if (pending.trim()) inspect(pending);
        },
      })
    ),
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }
  );
}
