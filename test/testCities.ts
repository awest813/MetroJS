import { TEST_CITIES, testCityById } from '../openpublica/src/scenarios/testCities';
import { SaveCodec } from '../openpublica/src/save/SaveCodec';

/**
 * The test city registry. Each city's own checks live in `testCity.<id>.ts`,
 * one file per city so Jest builds them in parallel.
 */

const ids = TEST_CITIES.map((c) => c.id);

describe('test cities', () => {
  it('should have unique ids, a summary, and what each covers', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of TEST_CITIES) {
      expect(c.summary.startsWith(c.title)).toBe(true);
      expect(c.covers.length).toBeGreaterThan(0);
      expect(testCityById(c.id)).toBe(c);
    }
    expect(testCityById('nowhere')).toBeUndefined();
  });

  it('should build the same city every time', () => {
    const once = testCityById('hamlet')!.build();
    const again = testCityById('hamlet')!.build();
    expect(JSON.stringify(SaveCodec.encode(again.sim))).toBe(JSON.stringify(SaveCodec.encode(once.sim)));
  });
});
