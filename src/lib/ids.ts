import { randomBytes } from "crypto";

export function createId(): string {
  return randomBytes(9).toString("base64url");
}

export function assertId(id: string): void {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw new Error("storyloom: That reference is not valid.");
  }
}
