// ⚠️  This file must NOT import anything from @babylonjs/core.

import type { Tool } from './Tool';
import type { TileCoord } from '../data/types';
import type { CitySim } from '../sim/CitySim';
import type { ServiceSpec } from './serviceCatalog';

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

  canApply(coord: TileCoord, sim: CitySim): boolean {
    return sim.canPlaceServiceBuilding(coord.x, coord.y, this.spec.defId, this.spec.cost);
  }

  apply(coord: TileCoord, sim: CitySim): boolean {
    return sim.placeServiceBuilding(coord.x, coord.y, this.spec.defId, this.spec.cost);
  }
}
