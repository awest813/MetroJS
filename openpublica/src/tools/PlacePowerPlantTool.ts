// ⚠️  This file must NOT import anything from @babylonjs/core.

import { PlaceServiceTool } from './PlaceServiceTool';
import { POWER_PLANT_SERVICE } from './serviceCatalog';

export { POWER_PLANT_COST } from './serviceCatalog';

export class PlacePowerPlantTool extends PlaceServiceTool {
  constructor() {
    super(POWER_PLANT_SERVICE);
  }
}
