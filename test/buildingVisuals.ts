import { ZoneType } from '../openpublica/src/sim/CityTile';
import {
  BUILDING_KITS,
  BUILDING_SHAPES,
  SKIP_MESH_DEF_IDS,
  kitPalette,
  kitForDef,
} from '../openpublica/src/render/buildingVisuals';

const BUILDING_JSON_IDS = [
  'small_house',
  'rowhouse',
  'small_shop',
  'light_workshop',
  'small_power_plant',
  'small_park',
  'shopfront_apartments',
  'corner_store_flats',
  'main_street_block',
] as const;

describe('buildingVisuals kits', () => {
  it('should define a kit for every buildings.json id', () => {
    for (const id of BUILDING_JSON_IDS) {
      expect(kitForDef(id)).not.toBeNull();
      expect(BUILDING_KITS[id].shape).toEqual(BUILDING_SHAPES[id]);
    }
  });

  it('should skip a mesh for parks', () => {
    expect(SKIP_MESH_DEF_IDS.has('small_park')).toBe(true);
    expect(BUILDING_KITS.small_park.skipMesh).toBe(true);
    expect(BUILDING_KITS.small_park.parts).toHaveLength(0);
  });

  it('should give houses a pitched roof and a door', () => {
    const parts = BUILDING_KITS.small_house.parts;
    expect(parts.some((p) => p.shape === 'prism' && p.slot === 'roof')).toBe(true);
    expect(parts.some((p) => p.slot === 'accent')).toBe(true);
  });

  it('should give rowhouses two window bands', () => {
    const glass = BUILDING_KITS.rowhouse.parts.filter((p) => p.slot === 'glass');
    expect(glass.length).toBeGreaterThanOrEqual(2);
  });

  it('should give shops an awning slab', () => {
    const awning = BUILDING_KITS.small_shop.parts.find((p) => p.slot === 'accent');
    expect(awning).toBeDefined();
    expect(awning!.d).toBeLessThan(BUILDING_KITS.small_shop.parts[0].d);
  });

  it('should give workshops a shed roof and a stack', () => {
    const kit = BUILDING_KITS.light_workshop;
    expect(kit.parts.some((p) => p.slot === 'roof' && p.rx)).toBe(true);
    expect(kit.parts.some((p) => p.shape === 'cylinder' && p.slot === 'stack')).toBe(true);
  });

  it('should give the power plant two stacks', () => {
    const stacks = BUILDING_KITS.small_power_plant.parts.filter((p) => p.slot === 'stack');
    expect(stacks).toHaveLength(2);
    expect(stacks.every((p) => p.shape === 'cylinder')).toBe(true);
  });

  it('should give mixed-use kits a podium plus upper storeys', () => {
    for (const id of ['shopfront_apartments', 'corner_store_flats', 'main_street_block'] as const) {
      const bodies = BUILDING_KITS[id].parts.filter((p) => p.slot === 'body');
      expect(bodies.length).toBeGreaterThanOrEqual(2);
      expect(bodies[0].h).toBeLessThan(bodies[1].h);
      expect(bodies[0].w).toBeGreaterThan(bodies[1].w);
    }
  });

  it('should keep warning palettes redder than zone palettes', () => {
    const zone = kitPalette('zone', ZoneType.Residential);
    const warn = kitPalette('warning', ZoneType.Residential);
    expect(warn.body.r).toBeGreaterThan(warn.body.g);
    expect(warn.body.g).toBeLessThan(zone.body.g);
  });
});
