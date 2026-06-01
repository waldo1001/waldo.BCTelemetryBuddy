import { parseSelection } from '../setup/parseSelection.js';

describe('parseSelection', () => {
    it('maps 1-based input to 0-based index', () => {
        expect(parseSelection('1', 3)).toBe(0);
        expect(parseSelection('3', 3)).toBe(2);
    });
    it('trims whitespace', () => {
        expect(parseSelection('  2 ', 3)).toBe(1);
    });
    it('rejects out-of-range, zero, negative', () => {
        expect(parseSelection('0', 3)).toBeNull();
        expect(parseSelection('4', 3)).toBeNull();
        expect(parseSelection('-1', 3)).toBeNull();
    });
    it('rejects non-numeric and empty', () => {
        expect(parseSelection('abc', 3)).toBeNull();
        expect(parseSelection('', 3)).toBeNull();
        expect(parseSelection('1.5', 3)).toBeNull();
    });
});
