// ⚠️  This file must NOT import anything from @babylonjs/core.

import { PlaceServiceTool } from './PlaceServiceTool';
import { FIRE_SERVICE } from './serviceCatalog';

export { FIRE_STATION_COST } from './serviceCatalog';

export class PlaceFireStationTool extends PlaceServiceTool {
  constructor() {
    super(FIRE_SERVICE);
  }
}
