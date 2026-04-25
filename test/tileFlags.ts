import * as TileFlags from "../src/tileFlags";

// These tests verify the internal consistency of the tile flag constants.
// The simulation engine uses bitwise OR/AND against these values extensively;
// any accidental collision or out-of-range value would silently corrupt tile state.

describe("tile flag constants", () => {

    it("each individual flag bit should be a power of two", () => {
        const individualFlags = [
            TileFlags.POWERBIT,
            TileFlags.CONDBIT,
            TileFlags.BURNBIT,
            TileFlags.BULLBIT,
            TileFlags.ANIMBIT,
            TileFlags.ZONEBIT,
        ];

        individualFlags.forEach((flag) => {
            expect(flag & (flag - 1)).toBe(0);
        });
    });

    it("each individual flag bit should be distinct (no overlapping bits)", () => {
        const individualFlags = [
            TileFlags.POWERBIT,
            TileFlags.CONDBIT,
            TileFlags.BURNBIT,
            TileFlags.BULLBIT,
            TileFlags.ANIMBIT,
            TileFlags.ZONEBIT,
        ];

        for (let i = 0; i < individualFlags.length; i++) {
            for (let j = i + 1; j < individualFlags.length; j++) {
                expect(individualFlags[i] & individualFlags[j]).toBe(0);
            }
        }
    });

    it("ALLBITS should be the exact OR of all individual flag bits", () => {
        const expected = TileFlags.POWERBIT | TileFlags.CONDBIT | TileFlags.BURNBIT |
                         TileFlags.BULLBIT | TileFlags.ANIMBIT | TileFlags.ZONEBIT;

        expect(TileFlags.ALLBITS).toBe(expected);
    });

    it("BIT_MASK should not overlap with any flag bit", () => {
        expect(TileFlags.BIT_MASK & TileFlags.ALLBITS).toBe(0);
    });

    it("BIT_MASK and ALLBITS together should cover the full 16-bit range", () => {
        expect(TileFlags.BIT_MASK | TileFlags.ALLBITS).toBe(0xFFFF);
    });

    it("NOFLAGS should be zero", () => {
        expect(TileFlags.NOFLAGS).toBe(0);
    });

    it("all flag values should fit within 16 bits", () => {
        const allFlagConstants = [
            TileFlags.POWERBIT,
            TileFlags.CONDBIT,
            TileFlags.BURNBIT,
            TileFlags.BULLBIT,
            TileFlags.ANIMBIT,
            TileFlags.ZONEBIT,
            TileFlags.ALLBITS,
            TileFlags.BIT_MASK,
        ];

        allFlagConstants.forEach((value) => {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(0xFFFF);
        });
    });
});
