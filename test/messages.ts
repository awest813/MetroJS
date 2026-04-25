import * as Messages from "../src/messages";

// These tests verify the integrity of the event-name constants in messages.ts.
// EventEmitter uses these strings as event keys; an undefined, empty, or accidentally
// duplicated string would cause events to be silently dropped or handled by the wrong listener.

// Collect all scalar (non-array) string exports.
const allStringConstants: { [name: string]: string } = Object.fromEntries(
    Object.entries(Messages).filter(([, v]) => typeof v === "string"),
) as { [name: string]: string };

describe("message constants", () => {

    it("every exported message constant should be a non-empty string", () => {
        Object.entries(allStringConstants).forEach(([_name, value]) => {
            expect(typeof value).toBe("string");
            expect(value.length).toBeGreaterThan(0);
        });
    });

    it("should document known duplicate string values (pre-existing bugs)", () => {
        // These pairs share the same string value in the original source.
        // This is a known pre-existing issue — the EventEmitter cannot distinguish between
        // the two events in each pair. Modernization must NOT introduce new duplicates.
        //
        // Known duplicates (do not fix here — tracked separately):
        //   FUNDS_CHANGED == HEAVY_TRAFFIC == "Total funds has changed"
        //   SOUND_EXPLOSIONHIGH == SOUND_EXPLOSIONLOW == "Explosion! Bang!"

        expect(Messages.FUNDS_CHANGED).toBe(Messages.HEAVY_TRAFFIC);
        expect(Messages.SOUND_EXPLOSIONHIGH).toBe(Messages.SOUND_EXPLOSIONLOW);
    });

    it("should have no additional duplicate string values beyond the known pairs", () => {
        // Build a map from string value → list of constant names that share it.
        const valueToNames: Map<string, string[]> = new Map();
        Object.entries(allStringConstants).forEach(([name, value]) => {
            const names = valueToNames.get(value) ?? [];
            names.push(name);
            valueToNames.set(value, names);
        });

        // Known duplicate values (pre-existing — see above).
        const knownDuplicateValues = new Set([
            Messages.FUNDS_CHANGED,      // == HEAVY_TRAFFIC
            Messages.SOUND_EXPLOSIONHIGH, // == SOUND_EXPLOSIONLOW
        ]);

        // Collect any duplicate values that are NOT in the known set.
        const unexpectedDuplicates: Array<{ value: string; names: string[] }> = [];
        valueToNames.forEach((names, value) => {
            if (names.length > 1 && !knownDuplicateValues.has(value)) {
                unexpectedDuplicates.push({ value, names });
            }
        });

        expect(unexpectedDuplicates).toEqual([]);
    });
});
