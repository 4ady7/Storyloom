export class ProviderError extends Error {
  status: number;

  constructor(status: number) {
    super(`provider:${status}`);
    this.name = "ProviderError";
    this.status = status;
  }
}

export function humanizeError(error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.status === 401 || error.status === 403) {
      return "The analysis provider rejected the server credentials. Your photographs are safe.";
    }
    if (error.status === 429) {
      return "The analysis provider is busy. Wait a moment and try again. Your photographs are safe.";
    }
    return "The analysis provider had a problem. Your photographs are safe. Try again.";
  }

  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "That took too long. Your photographs are safe. Try again.";
    }
    if (error.message.startsWith("storyloom:")) {
      return error.message.slice("storyloom:".length).trim();
    }
  }

  return "Storyloom could not finish that. Your original photographs are safe. Try again.";
}

export function userError(message: string): Error {
  return new Error(`storyloom: ${message}`);
}
