// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import { serviceSpecForDef, type ServiceSpec } from './serviceCatalog';
import { isTierUpgrade } from '../sim/serviceTiers';

/** Places one civic/utility building from the service catalog. */
export class PlaceServiceTool implements Tool {
  readonly name: string;
  readonly label: string;
  readonly spec: ServiceSpec;

  constructor(spec: ServiceSpec) {
    this.spec = spec;
    this.name = spec.toolName;
    this.label = spec.label;
  }

  /**
   * What placing here costs: the full price, or on the service's small tier
   * (a pump under a tower) only the difference.
   */
  costAt(coord: TileCoord, sim: CitySim): number {
    const existing = sim.getTile(coord.x, coord.y)?.buildingId ?? null;
    if (!isTierUpgrade(existing, this.spec.defId)) return this.spec.cost;
    return Math.max(0, this.spec.cost - (serviceSpecForDef(existing!)?.cost ?? 0));
  }

  /** True when placing here upgrades the service's small tier. */
  upgrades(coord: TileCoord, sim: CitySim): boolean {
    return isTierUpgrade(sim.getTile(coord.x, coord.y)?.buildingId ?? null, this.spec.defId);
  }

  canApply(coord: TileCoord, sim: CitySim): boolean {
    return sim.canPlaceServiceBuilding(coord.x, coord.y, this.spec.defId, this.costAt(coord, sim));
  }

  apply(coord: TileCoord, sim: CitySim): boolean {
    return sim.placeServiceBuilding(coord.x, coord.y, this.spec.defId, this.costAt(coord, sim));
  }
}
