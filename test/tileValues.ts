import * as TileValues from "../src/tileValues";

// These tests verify the internal consistency of the tile value constants.
// The simulation engine uses these index values to read and write tiles on the game map.
// Accidental renumbering of any constant here would corrupt saved games and break simulation
// logic silently at runtime.

describe("tile value constant ranges", () => {

    it("DIRT should be 0", () => {
        expect(TileValues.DIRT).toBe(0);
    });

    it("TILE_INVALID should be negative", () => {
        expect(TileValues.TILE_INVALID).toBeLessThan(0);
    });

    it("TILE_COUNT should be greater than the last defined tile index", () => {
        // LASTZONE is 826; extended zone tiles go up to ~1019.
        expect(TileValues.TILE_COUNT).toBeGreaterThan(TileValues.LASTZONE);
    });

    describe("water tiles", () => {

        it("WATER_LOW should be less than or equal to WATER_HIGH", () => {
            expect(TileValues.WATER_LOW).toBeLessThanOrEqual(TileValues.WATER_HIGH);
        });

        it("RIVER should equal WATER_LOW", () => {
            expect(TileValues.RIVER).toBe(TileValues.WATER_LOW);
        });

        it("LASTRIVEDGE should equal WATER_HIGH", () => {
            expect(TileValues.LASTRIVEDGE).toBe(TileValues.WATER_HIGH);
        });
    });

    describe("road tiles", () => {

        it("ROADBASE should be less than LASTROAD", () => {
            expect(TileValues.ROADBASE).toBeLessThan(TileValues.LASTROAD);
        });

        it("HBRIDGE should equal ROADBASE", () => {
            expect(TileValues.HBRIDGE).toBe(TileValues.ROADBASE);
        });

        it("ROADS should be within the road tile range", () => {
            expect(TileValues.ROADS).toBeGreaterThanOrEqual(TileValues.ROADBASE);
            expect(TileValues.ROADS).toBeLessThanOrEqual(TileValues.LASTROAD);
        });

        it("low-traffic base tile should be within the road tile range", () => {
            expect(TileValues.LTRFBASE).toBeGreaterThanOrEqual(TileValues.ROADBASE);
            expect(TileValues.LTRFBASE).toBeLessThanOrEqual(TileValues.LASTROAD);
        });

        it("high-traffic base tile should be greater than low-traffic base tile", () => {
            expect(TileValues.HTRFBASE).toBeGreaterThan(TileValues.LTRFBASE);
        });
    });

    describe("power line tiles", () => {

        it("POWERBASE should be less than LASTPOWER", () => {
            expect(TileValues.POWERBASE).toBeLessThan(TileValues.LASTPOWER);
        });

        it("HPOWER should equal POWERBASE", () => {
            expect(TileValues.HPOWER).toBe(TileValues.POWERBASE);
        });
    });

    describe("residential zone tiles", () => {

        it("RESBASE should be less than COMBASE", () => {
            expect(TileValues.RESBASE).toBeLessThan(TileValues.COMBASE);
        });

        it("FREEZ should be within the residential zone range", () => {
            expect(TileValues.FREEZ).toBeGreaterThanOrEqual(TileValues.RESBASE);
            expect(TileValues.FREEZ).toBeLessThan(TileValues.COMBASE);
        });

        it("HOUSE tiles should start above RESBASE", () => {
            expect(TileValues.HOUSE).toBeGreaterThan(TileValues.RESBASE);
            expect(TileValues.HHTHR).toBeGreaterThan(TileValues.LHTHR);
        });
    });

    describe("commercial zone tiles", () => {

        it("COMBASE should be less than INDBASE", () => {
            expect(TileValues.COMBASE).toBeLessThan(TileValues.INDBASE);
        });

        it("COMCLR should be within the commercial zone range", () => {
            expect(TileValues.COMCLR).toBeGreaterThanOrEqual(TileValues.COMBASE);
            expect(TileValues.COMCLR).toBeLessThan(TileValues.INDBASE);
        });
    });

    describe("industrial zone tiles", () => {

        it("INDBASE should be less than PORTBASE", () => {
            expect(TileValues.INDBASE).toBeLessThan(TileValues.PORTBASE);
        });

        it("INDCLR should be within the empty industrial zone range", () => {
            expect(TileValues.INDCLR).toBeGreaterThanOrEqual(TileValues.INDBASE);
            expect(TileValues.INDCLR).toBeLessThanOrEqual(TileValues.LASTIND);
        });
    });

    describe("power plant tiles", () => {

        it("COALBASE should be less than LASTPOWERPLANT", () => {
            expect(TileValues.COALBASE).toBeLessThan(TileValues.LASTPOWERPLANT);
        });

        it("POWERPLANT center tile should be within the coal plant range", () => {
            expect(TileValues.POWERPLANT).toBeGreaterThanOrEqual(TileValues.COALBASE);
            expect(TileValues.POWERPLANT).toBeLessThanOrEqual(TileValues.LASTPOWERPLANT);
        });

        it("NUCLEARBASE should be less than LASTZONE", () => {
            expect(TileValues.NUCLEARBASE).toBeLessThan(TileValues.LASTZONE);
        });

        it("NUCLEAR center tile should be within the nuclear plant range", () => {
            expect(TileValues.NUCLEAR).toBeGreaterThanOrEqual(TileValues.NUCLEARBASE);
            expect(TileValues.NUCLEAR).toBeLessThanOrEqual(TileValues.LASTZONE);
        });
    });

    describe("fire station and police station tiles", () => {

        it("FIRESTBASE should be less than POLICESTBASE", () => {
            expect(TileValues.FIRESTBASE).toBeLessThan(TileValues.POLICESTBASE);
        });

        it("FIRESTATION center tile should be within fire station range", () => {
            expect(TileValues.FIRESTATION).toBeGreaterThanOrEqual(TileValues.FIRESTBASE);
            expect(TileValues.FIRESTATION).toBeLessThan(TileValues.POLICESTBASE);
        });

        it("POLICESTATION center tile should be within police station range", () => {
            expect(TileValues.POLICESTATION).toBeGreaterThanOrEqual(TileValues.POLICESTBASE);
            expect(TileValues.POLICESTATION).toBeLessThan(TileValues.STADIUMBASE);
        });
    });
});
