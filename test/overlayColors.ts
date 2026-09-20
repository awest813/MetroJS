import { CityMap } from '../openpublica/src/sim/CityMap';
import { RoadType, ZoneType } from '../openpublica/src/sim/CityTile';
import {
  OVERLAY_CLEAR,
  colorForLandValue,
  colorForOverlay,
  colorForCrime,
  colorForDensity,
  colorForFire,
  colorForWater,
  colorForPollution,
  colorForPower,
  colorForTraffic,
} from '../openpublica/src/render/overlayColors';

describe('overlayColors', () => {
  it('should tint powered lots green and unpowered buildings red', () => {
    expect(colorForPower(true, false).g).toBeGreaterThan(0.5);
    expect(colorForPower(false, true).r).toBeGreaterThan(0.5);
    expect(colorForPower(false, false)).toEqual(OVERLAY_CLEAR);
  });

  it('should run land value from red through yellow to green', () => {
    const low = colorForLandValue(0);
    const mid = colorForLandValue(50);
    const high = colorForLandValue(100);
    expect(low.r).toBeGreaterThan(low.g);
    expect(mid.g).toBeGreaterThan(0.5);
    expect(high.g).toBeGreaterThan(high.r);
  });

  it('should hide traffic off-road and redden busy streets', () => {
    expect(colorForTraffic(RoadType.None, 20)).toEqual(OVERLAY_CLEAR);
    const hot = colorForTraffic(RoadType.Street, 12);
    expect(hot.a).toBeGreaterThan(0.4);
    expect(hot.r).toBeGreaterThan(hot.g);
  });

  it('should leave empty crowd and crime tiles clear', () => {
    expect(colorForDensity(0)).toEqual(OVERLAY_CLEAR);
    expect(colorForCrime(0)).toEqual(OVERLAY_CLEAR);
    expect(colorForFire(0)).toEqual(OVERLAY_CLEAR);
    expect(colorForWater(false)).toEqual(OVERLAY_CLEAR);
    expect(colorForWater(true).b).toBeGreaterThan(colorForWater(true).r);
    const crowd = colorForDensity(80);
    const heat = colorForCrime(80);
    const cover = colorForFire(80);
    expect(crowd.b).toBeGreaterThan(crowd.g);
    expect(heat.r).toBeGreaterThan(heat.g);
    expect(cover.r).toBeGreaterThan(cover.b);
    expect(cover.g).toBeGreaterThan(heat.g);
  });

  it('should leave clean tiles clear and haze polluted ones brown', () => {
    expect(colorForPollution(0)).toEqual(OVERLAY_CLEAR);
    const haze = colorForPollution(80);
    expect(haze.a).toBeGreaterThan(0.3);
    expect(haze.r).toBeGreaterThan(haze.b);
    expect(haze.r).toBeGreaterThan(haze.g);
  });

  it('should dispatch per overlay mode from the live tile', () => {
    const map = new CityMap(2, 2);
    const tile = map.getTile(0, 0)!;
    tile.zoneType = ZoneType.Industrial;
    tile.pollution = 60;
    tile.powered = true;
    tile.buildingId = 'light_workshop';
    tile.populationDensity = 70;
    tile.crime = 55;
    tile.fireCoverage = 80;
    tile.watered = true;
    expect(colorForOverlay('pollution', tile).a).toBeGreaterThan(0);
    expect(colorForOverlay('power', tile).g).toBeGreaterThan(0.5);
    expect(colorForOverlay('density', tile).a).toBeGreaterThan(0);
    expect(colorForOverlay('crime', tile).a).toBeGreaterThan(0);
    expect(colorForOverlay('fire', tile).a).toBeGreaterThan(0);
    expect(colorForOverlay('water', tile).a).toBeGreaterThan(0);
  });
});
