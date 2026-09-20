// ⚠️  This file must NOT import anything from @babylonjs/core.

import { PlaceServiceTool } from './PlaceServiceTool';
import { POLICE_SERVICE } from './serviceCatalog';

export { POLICE_STATION_COST } from './serviceCatalog';

export class PlacePoliceStationTool extends PlaceServiceTool {
  constructor() {
    super(POLICE_SERVICE);
  }
}
