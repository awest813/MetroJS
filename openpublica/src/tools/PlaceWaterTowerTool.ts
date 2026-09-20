// ⚠️  This file must NOT import anything from @babylonjs/core.

import { PlaceServiceTool } from './PlaceServiceTool';
import { WATER_SERVICE } from './serviceCatalog';

export { WATER_TOWER_COST } from './serviceCatalog';

export class PlaceWaterTowerTool extends PlaceServiceTool {
  constructor() {
    super(WATER_SERVICE);
  }
}
