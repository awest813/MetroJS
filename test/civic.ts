import { CitySim } from '../openpublica/src/sim/CitySim';
import { RoadType } from '../openpublica/src/sim/CityTile';
import { civicBonuses, isUnlocked, unlockedBy, unlocksText } from '../openpublica/src/sim/civic';
import { MILESTONES } from '../openpublica/src/sim/milestones';
import { composeHappiness } from '../openpublica/src/sim/happiness';
import { SHOP_JOBS_PER_RESIDENT, nextCommercialDemand } from '../openpublica/src/sim/ZoneGrowthSystem';
import { explainToolFailure } from '../openpublica/src/tools/toolFeedback';
import { CIVIC_SPECS, CLINIC_SERVICE, civicEffectText } from '../openpublica/src/tools/serviceCatalog';
import { milestoneBanner, milestoneTooltip } from '../openpublica/src/ui/chromeCopy';

/** A city with a plant on a street, rich, at `reached` milestones. */
function city(reached: number): CitySim {
  const sim = CitySim.createCity(24, 24);
  sim.stats.money = 100_000;
  sim.stats.milestones = reached;
  sim.placeServiceBuilding(0, 0, 'small_power_plant', 0);
  for (let x = 0; x < 12; x++) sim.placeRoad(x, 1, RoadType.Street);
  return sim;
}

describe('late civic buildings', () => {
  it('should unlock the gas plant and clinic at Town, the college and stadium at City, and the city hall at Capital', () => {
    expect(unlockedBy('clinic')?.name).toBe('Town');
    expect(unlockedBy('stadium')?.name).toBe('City');
    expect(unlockedBy('city_hall')?.name).toBe('Capital');
    expect(unlockedBy('small_fire_station')).toBeNull();
    expect(isUnlocked('clinic', 1)).toBe(false);
    expect(isUnlocked('clinic', 2)).toBe(true);
    expect(isUnlocked('college', 2)).toBe(false);
    expect(isUnlocked('small_park', 0)).toBe(true);
    expect(unlocksText(MILESTONES[1].unlocks)).toBe('a gas plant and a clinic');
  });

  it('should refuse a locked building, and a second of a one-per-city building', () => {
    const village = city(1);
    expect(village.placeServiceBuilding(3, 2, 'clinic', 2_000)).toBe(false);
    expect(explainToolFailure('placeClinic', { x: 3, y: 2 }, village)).toBe('A clinic unlocks at Town (400 people).');
    const town = city(2);
    expect(town.placeServiceBuilding(3, 2, 'clinic', 2_000)).toBe(true);
    expect(town.stats.money).toBe(98_000);
    expect(town.placeServiceBuilding(5, 2, 'clinic', 2_000)).toBe(false);
    expect(explainToolFailure('placeClinic', { x: 5, y: 2 }, town)).toBe('The city already has a clinic.');
    // The gas plant is power, not one per city.
    expect(town.placeServiceBuilding(6, 2, 'gas_power_plant', 0)).toBe(true);
    expect(town.placeServiceBuilding(7, 2, 'gas_power_plant', 0)).toBe(true);
  });

  it('should count a civic building only while it has power and a street', () => {
    const sim = city(4);
    sim.placeServiceBuilding(3, 2, 'clinic', 0);
    sim.placeServiceBuilding(4, 2, 'stadium', 0);
    sim.placeServiceBuilding(5, 2, 'city_hall', 0);
    expect(civicBonuses(sim.map, sim.growth.buildings, sim.growth.defs)).toEqual({ happiness: 10, shopDemand: 10, rating: 10 });
    expect(sim.stats.civic).toEqual({ happiness: 10, shopDemand: 10, rating: 10 });
    // A clinic across the map, with no street: nothing.
    const far = city(2);
    far.placeServiceBuilding(20, 20, 'clinic', 0);
    expect(far.stats.civic?.happiness).toBe(0);
  });

  it('should add its bonuses to happiness, shop demand, and the rating', () => {
    const sim = city(4);
    const stats: Parameters<typeof composeHappiness>[1] = {
      walkability: 0, transitAccess: 0, crimeAverage: 40, happiness: 0, civic: { happiness: 10 },
    };
    composeHappiness(sim.map, stats, true);
    const without = { ...stats, civic: undefined };
    composeHappiness(sim.map, without, true);
    expect(stats.happiness).toBe(without.happiness + 10);
    expect(stats.happinessParts?.civic).toBe(10);

    // Shops already employ all they can: no demand, except the stadium's visitors.
    const shops = { population: 100, shopJobs: 100 * SHOP_JOBS_PER_RESIDENT, commercialDemand: 0, walkability: 0, transitAccess: 0 };
    expect(nextCommercialDemand(shops)).toBe(0);
    expect(nextCommercialDemand({ ...shops, civic: { happiness: 0, shopDemand: 10, rating: 0 } })).toBeGreaterThan(0);

    sim.placeServiceBuilding(5, 2, 'city_hall', 0);
    expect(sim.stats.ratingParts?.civic).toBe(10);
  });

  it('should lift land value around a working college', () => {
    const sim = city(3);
    const before = sim.getTile(6, 4)!.landValue;
    const farBefore = sim.getTile(22, 22)!.landValue;
    sim.placeServiceBuilding(5, 2, 'college', 0);
    expect(sim.getTile(6, 4)!.landValue).toBeGreaterThan(before + 5);
    // Out of its reach: unchanged.
    expect(sim.getTile(22, 22)!.landValue).toBe(farBefore);
  });

  it('should describe each civic building by what it does', () => {
    const sim = CitySim.createCity(8, 8);
    const text = CIVIC_SPECS.map((spec) => civicEffectText(sim.growth.defs.get(spec.defId)!));
    expect(text).toEqual([
      null,
      'happiness +5 city-wide',
      'land value +12 within 10 tiles',
      'happiness +5, shop demand +10 city-wide',
      'rating +10 city-wide',
    ]);
    expect(CLINIC_SERVICE.cost).toBe(2_000);
  });

  it('should name the unlocks in the milestone banner and tooltip', () => {
    expect(milestoneBanner(MILESTONES[1], 2, 412).body).toMatch(/You can now build a gas plant and a clinic\./);
    const tip = milestoneTooltip({ population: 300, jobs: 200, approval: 70, money: 10, bankruptcyWarning: false }, 1);
    expect(tip).toMatch(/state grant and unlocks a gas plant and a clinic\.$/);
  });
});
