/**
 * Utility function to conditionally join class names together.
 * Works similarly to clsx but lightweight.
 *
 * @param {...any} classes - Class names, booleans, or objects
 * @returns {string} Combined class name string
 */
export function cn(...classes: (string | boolean | null | undefined | object)[]): string {
  const result: string[] = [];

  for (const cls of classes) {
    if (!cls) continue;

    if (typeof cls === "string") {
      result.push(cls);
    } else if (typeof cls === "object" && cls !== null) {
      for (const key in cls) {
        if (cls[key]) {
          result.push(key);
        }
      }
    }
  }

  return result.join(" ");
}
