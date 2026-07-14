type ClassValue = string | number | null | undefined | false | ClassValue[];

function flatten(input: ClassValue, out: string[]) {
  if (!input) return;
  if (Array.isArray(input)) {
    for (const item of input) flatten(item, out);
    return;
  }
  out.push(String(input));
}

/** Joins conditional class names, skipping falsy values. */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) flatten(input, out);
  return out.join(" ");
}
