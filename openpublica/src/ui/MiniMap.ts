import type { CityMap } from '../sim/CityMap';
import { RoadType, TerrainType, ZoneType } from '../sim/CityTile';
import { MAP_SIZE } from '../data/constants';

/**
 * Cheap 2D city sketch. No Babylon, no second camera.
 * (0,0) is bottom-left so it matches world XZ.
 */
export class MiniMap {
  private readonly _ctx: CanvasRenderingContext2D;
  private _onJump: ((x: number, y: number) => void) | undefined;
  private _markX = MAP_SIZE / 2;
  private _markY = MAP_SIZE / 2;

  constructor(parent: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_SIZE;
    canvas.height = MAP_SIZE;
    canvas.className = 'minimap-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'City minimap. Click to look at a tile.');
    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const u = (event.clientX - rect.left) / rect.width;
      const v = (event.clientY - rect.top) / rect.height;
      const x = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(u * MAP_SIZE)));
      const y = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor((1 - v) * MAP_SIZE)));
      this._onJump?.(x, y);
    });
    parent.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable for minimap');
    this._ctx = ctx;
  }

  onJump(fn: (x: number, y: number) => void): void {
    this._onJump = fn;
  }

  setMarker(worldX: number, worldZ: number): void {
    this._markX = worldX;
    this._markY = worldZ;
  }

  redraw(map: CityMap): void {
    const { _ctx: ctx } = this;
    const img = ctx.createImageData(MAP_SIZE, MAP_SIZE);
    const data = img.data;
    map.forEach((tile) => {
      const px = tile.x;
      const py = MAP_SIZE - 1 - tile.y;
      const i = (py * MAP_SIZE + px) * 4;
      const c = _miniColor(tile.terrain, tile.roadType, tile.zoneType, tile.buildingId);
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    });
    ctx.putImageData(img, 0, 0);

    const mx = this._markX + 0.5;
    const my = MAP_SIZE - (this._markY + 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, my, 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function _miniColor(
  terrain: TerrainType,
  road: RoadType,
  zone: ZoneType,
  buildingId: string | null,
): [number, number, number] {
  if (terrain === TerrainType.Water) return [18, 72, 118];
  if (buildingId === 'small_park') return [36, 140, 58];
  if (buildingId === 'small_power_plant') return [210, 196, 72];
  if (buildingId === 'small_police_station') return [48, 88, 168];
  if (road === RoadType.TrolleyAvenue) return [92, 64, 42];
  if (road === RoadType.Street || road === RoadType.Highway) return [48, 50, 54];
  if (buildingId !== null) {
    if (zone === ZoneType.Residential) return [48, 92, 168];
    if (zone === ZoneType.Commercial) return [196, 150, 28];
    if (zone === ZoneType.Industrial) return [128, 72, 168];
    if (zone === ZoneType.MixedUse) return [32, 148, 132];
    return [90, 90, 90];
  }
  if (zone === ZoneType.Residential) return [110, 150, 210];
  if (zone === ZoneType.Commercial) return [230, 200, 70];
  if (zone === ZoneType.Industrial) return [170, 120, 196];
  if (zone === ZoneType.MixedUse) return [70, 190, 170];
  if (terrain === TerrainType.Dirt) return [86, 112, 64];
  return [52, 108, 52];
}
