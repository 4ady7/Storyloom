export async function readNdjson(response: Response, onEvent: (event: Record<string, unknown>) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Storyloom could not read the response.");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as Record<string, unknown>);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as Record<string, unknown>);
}
