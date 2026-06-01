/**
 * Parse a "pick a number" answer (1-based, as shown to the user) into a 0-based
 * array index. Returns null for anything invalid (non-integer, out of range).
 */
export function parseSelection(input: string, count: number): number | null {
    const trimmed = input.trim();
    if (!/^\d+$/.test(trimmed)) {
        return null;
    }
    const n = Number(trimmed);
    if (n < 1 || n > count) {
        return null;
    }
    return n - 1;
}
