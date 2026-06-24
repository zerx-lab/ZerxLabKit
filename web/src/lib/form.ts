// firstErrorMessage extracts a human-readable message from a TanStack Form
// field error array. Standard Schema (Zod) issues are objects with `.message`;
// some validators yield plain strings.
export function firstErrorMessage(errors: readonly unknown[]): string | null {
  const first = errors[0];
  if (first == null) {
    return null;
  }
  if (typeof first === "string") {
    return first;
  }
  if (typeof first === "object" && "message" in first) {
    const message = (first as { message: unknown }).message;
    return typeof message === "string" ? message : String(message);
  }
  return String(first);
}
