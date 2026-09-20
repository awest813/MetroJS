import { daylightPalette } from '../openpublica/src/render/skyColors';

describe('daylightPalette', () => {
  it('should keep dawn warm and east of noon', () => {
    const dawn = daylightPalette(0);
    const noon = daylightPalette(0.5);
    expect(dawn.sun.r).toBeGreaterThan(dawn.sun.g);
    expect(dawn.horizon.r).toBeGreaterThan(dawn.horizon.b);
    expect(dawn.azimuth).toBeLessThan(noon.azimuth);
    expect(dawn.height).toBeLessThan(noon.height);
    expect(dawn.sunIntensity).toBeLessThan(noon.sunIntensity);
  });

  it('should peak sun height and noon albedo at midday', () => {
    const noon = daylightPalette(0.5);
    expect(noon.sun.g).toBeCloseTo(0.96, 5);
    expect(noon.sun.b).toBeCloseTo(0.88, 5);
    expect(noon.height).toBeCloseTo(1.37, 5);
    expect(noon.zenith.b).toBeGreaterThan(noon.zenith.r);
  });

  it('should cool the zenith at dusk without going black', () => {
    const dusk = daylightPalette(1);
    expect(dusk.zenith.b).toBeGreaterThan(dusk.zenith.r);
    expect(dusk.horizon.r).toBeGreaterThan(dusk.horizon.g);
    expect(dusk.sunIntensity).toBeGreaterThan(0.7);
    expect(dusk.fillIntensity).toBeGreaterThan(0.5);
    for (const c of [dusk.zenith, dusk.horizon, dusk.ambient, dusk.sun]) {
      expect(c.r + c.g + c.b).toBeGreaterThan(0.9);
    }
  });

  it('should clamp out-of-range day values', () => {
    expect(daylightPalette(-2)).toEqual(daylightPalette(0));
    expect(daylightPalette(4)).toEqual(daylightPalette(1));
  });
});
