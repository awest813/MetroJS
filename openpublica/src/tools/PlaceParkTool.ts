// ⚠️  This file must NOT import anything from @babylonjs/core.

import { PlaceServiceTool } from './PlaceServiceTool';
import { PARK_SERVICE } from './serviceCatalog';

export { PARK_COST } from './serviceCatalog';

export class PlaceParkTool extends PlaceServiceTool {
  constructor() {
    super(PARK_SERVICE);
  }
}
