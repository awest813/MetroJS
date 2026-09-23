import type { Scene, ShadowGenerator } from '@babylonjs/core';
import type { CitySim } from '../sim/CitySim';
import { TerrainType, type CityTile } from '../sim/CityTile';
import { HeightField, WATER_SURFACE_Y } from '../sim/HeightField';
import { tileKey } from '../sim/ZoneGrowthSystem';
import { isBridge, roadProfile } from '../sim/roadConnections';
import { dispatchCoverage } from '../sim/roadDispatch';
import type { TileCoord } from '../data/types';
import type { QualityLevel } from '../ui/settingsStore';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { BuildingRenderer } from '../render/BuildingRenderer';
import { OverlayRenderer } from '../render/OverlayRenderer';
import { TrafficVehicleRenderer } from '../render/TrafficVehicleRenderer';
import { RoadRenderer, ROAD_DECK_LIFT } from '../render/RoadRenderer';
import { deckBaseHeight, deckDirtyTiles } from '../render/roadDeck';
import { buildingFacing } from '../render/buildingFacing';
import type { SurfaceHeights, TileTint } from '../render/HighlightRenderer';
import { VegetationRenderer } from '../render/VegetationRenderer';
import { SmokeRenderer } from '../render/SmokeRenderer';
import { WaterRenderer } from '../render/WaterRenderer';
import { HighlightRenderer } from '../render/HighlightRenderer';
import { TilePicker } from '../render/TilePicker';
import type { CameraController } from '../render/CameraController';

/**
 * Owns the Babylon view of one city: terrain, kits, roads, overlay, traffic.
 * Simulation stays outside. Load/new city call rebuildAll().
 */
export class CityView {
  heights: HeightField;
  readonly terrain: TerrainRenderer;
  readonly buildings: BuildingRenderer;
  readonly overlay: OverlayRenderer;
  readonly traffic: TrafficVehicleRenderer;
  readonly roads: RoadRenderer;
  readonly vegetation: VegetationRenderer;
  readonly smoke: SmokeRenderer;
  readonly highlight: HighlightRenderer;
  readonly picker: TilePicker;
  /** Visible surface for cursors: terrain, the water plane, or a bridge deck. */
  readonly surface: SurfaceHeights;
  onRedraw: () => void = () => {};
  private readonly _sim: CitySim;

  constructor(
    scene: Scene,
    camera: CameraController,
    shadows: ShadowGenerator,
    sim: CitySim,
    heights: HeightField,
  ) {
    this._sim = sim;
    this.heights = heights;
    this.surface = { tileCenter: (x, y) => this.surfaceY(x, y) };
    this.terrain = new TerrainRenderer(scene, shadows);
    this.terrain.buildCityGrid(sim.map, heights);
    new WaterRenderer(scene);

    this.buildings = new BuildingRenderer(scene, shadows);
    this.buildings.setHeightField(heights);
    this.overlay = new OverlayRenderer(scene);
    this.overlay.build(sim.map, heights);
    this.traffic = new TrafficVehicleRenderer(scene, shadows);
    this.traffic.rebuildGraph(sim.map, heights);
    this.roads = new RoadRenderer(scene, shadows);
    this.roads.rebuild(sim.map, heights);
    this.vegetation = new VegetationRenderer(scene, shadows);
    this.vegetation.rebuild(sim.map, heights);
    this.smoke = new SmokeRenderer(scene);
    this.smoke.rebuild(sim.map, heights);
    this.highlight = new HighlightRenderer(scene);
    this.picker = new TilePicker(scene, camera);
    this.picker.setDeckTop((x, y) => (isBridge(this._sim.getTile(x, y)) ? this.surfaceY(x, y) : null));
  }

  /** Top of whatever the player sees at (x, y). */
  surfaceY(x: number, y: number): number {
    const tile = this._sim.getTile(x, y);
    if (tile && isBridge(tile)) {
      return deckBaseHeight(this._sim.map, this.heights, x, y) +
        ROAD_DECK_LIFT + roadProfile(tile.roadType).thickness;
    }
    if (tile?.terrain === TerrainType.Water) {
      return Math.max(this.heights.tileCenter(x, y), WATER_SURFACE_Y);
    }
    return this.heights.footing(x, y);
  }

  /** Tint tiles one colour each, e.g. the streets and lots a utility network feeds. */
  previewTints(tints: ReadonlyArray<TileTint>): void {
    const map = this._sim.map;
    this.highlight.showTints(tints, this.heights, (tx, ty) =>
      map.getTile(tx, ty)?.terrain === TerrainType.Water ? this.surfaceY(tx, ty) : null);
  }

  /** Paint the tiles a police/fire station on (x, y) would reach by road. */
  previewDispatch(
    x: number,
    y: number,
    reach: number,
    rgb: { r: number; g: number; b: number },
  ): void {
    const map = this._sim.map;
    const tiles = dispatchCoverage(map, x, y, reach);
    this.highlight.showReach(tiles, rgb, this.heights, (tx, ty) => {
      const tile = map.getTile(tx, ty);
      return tile?.terrain === TerrainType.Water ? this.surfaceY(tx, ty) : null;
    });
  }

  applyQuality(level: QualityLevel, sim: CitySim): void {
    const high = level === 'high';
    this.smoke.setEnabled(high);
    if (this.vegetation.setStreetTrees(high)) {
      this.vegetation.rebuild(sim.map, this.heights);
    }
  }

  refreshPowerVisuals(sim: CitySim): void {
    sim.map.forEach((tile) => {
      this.buildings.updatePowerState(tile.x, tile.y, tile.powered);
    });
    this.overlay.refresh(sim.map);
  }

  /** Full mesh rebuild after SaveSystem.load. */
  rebuildAll(sim: CitySim): void {
    this.heights = HeightField.fromMap(sim.map, sim.terrainSeed);
    this.buildings.setHeightField(this.heights);
    this.terrain.buildCityGrid(sim.map, this.heights);
    this.overlay.rebuild(sim.map, this.heights);
    this.roads.rebuild(sim.map, this.heights);
    this.vegetation.setHeightField(this.heights);
    this.vegetation.rebuild(sim.map, this.heights);
    this.smoke.rebuild(sim.map, this.heights);

    sim.map.forEach((tile) => this.buildings.removeBuilding(tile.x, tile.y));
    for (const instance of sim.growth.buildings.values()) {
      const tile = sim.getTile(instance.x, instance.y);
      if (tile) {
        this.buildings.addBuilding(instance, tile.zoneType, buildingFacing(sim.map, instance.x, instance.y));
      }
    }

    this.refreshPowerVisuals(sim);
    this.traffic.rebuildGraph(sim.map, this.heights);
    this.onRedraw();
  }

  /**
   * Refresh meshes after a tool changed these tiles. The traffic graph was
   * already rebuilt by the sim's onTrafficChanged for the same edit. Per-tile
   * work stays local; map-wide refreshes run once for the whole edit.
   */
  syncPaintedTiles(sim: CitySim, coords: readonly TileCoord[]): void {
    const map = sim.map;
    const tiles = coords.map((c) => sim.getTile(c.x, c.y)).filter((t): t is CityTile => t !== undefined);
    if (tiles.length === 0) return;
    this.terrain.updateCityTiles(tiles);
    this._regradeAround(sim, tiles);

    const decks = new Map<string, TileCoord>();
    const around = new Map<string, TileCoord>();
    const facing = new Map<string, TileCoord>();
    let smoke = false;
    for (const tile of tiles) {
      for (const d of deckDirtyTiles(map, tile.x, tile.y)) decks.set(`${d.x},${d.y}`, d);
      around.set(`${tile.x},${tile.y}`, tile);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: tile.x + dx, y: tile.y + dy };
        around.set(`${n.x},${n.y}`, n);
        facing.set(`${n.x},${n.y}`, n);
      }
      const drawn = this.buildings.defAt(tile.x, tile.y);
      if (tile.buildingId === 'small_power_plant' || drawn === 'small_power_plant') smoke = true;
      if (tile.buildingId === null) {
        this.buildings.removeBuilding(tile.x, tile.y);
      } else {
        const instance = sim.growth.buildings.get(tileKey(tile.x, tile.y));
        if (instance) {
          this.buildings.addBuilding(instance, tile.zoneType, buildingFacing(map, tile.x, tile.y));
        }
      }
    }
    const deckList = Array.from(decks.values());
    this.roads.rebuildTiles(map, deckList);
    this.overlay.updateTiles(map, deckList);
    this.vegetation.updateTiles(map, Array.from(around.values()));
    if (smoke) this.smoke.rebuild(map, this.heights);
    // A road paved or cleared beside a building can change which way it faces.
    for (const n of facing.values()) {
      if (sim.getTile(n.x, n.y)?.buildingId) this.buildings.setFacing(n.x, n.y, buildingFacing(map, n.x, n.y));
    }
    this.refreshPowerVisuals(sim);
    this.onRedraw();
  }

  /**
   * A road appeared or went away: grade the ground under it and move
   * everything that stands on the tiles whose corners shifted.
   */
  private _regradeAround(sim: CitySim, coords: readonly TileCoord[]): void {
    const map = sim.map;
    const byKey = new Map<string, TileCoord>();
    for (const coord of coords) {
      for (const t of this.heights.regrade(map, coord.x, coord.y, coord.x, coord.y)) byKey.set(`${t.x},${t.y}`, t);
    }
    if (byKey.size === 0) return;
    const moved = Array.from(byKey.values());
    // Road seams average neighbouring decks, and bridge spans ramp to their
    // abutments, so re-seat one ring further plus any span touching it.
    const touched = new Map<string, TileCoord>();
    for (const t of moved) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (const d of deckDirtyTiles(map, t.x + dx, t.y + dy)) touched.set(`${d.x},${d.y}`, d);
        }
      }
    }
    const around = Array.from(touched.values());
    this.terrain.refreshHeights(moved);
    this.roads.rebuildTiles(map, around);
    this.overlay.updateTiles(map, around);
    this.vegetation.updateTiles(map, moved);
    this.buildings.reseat(moved);
    this.traffic.refreshDecks(map);
    if (moved.some((t) => map.getTile(t.x, t.y)?.buildingId === 'small_power_plant')) {
      this.smoke.rebuild(map, this.heights);
    }
  }

  /** Returns true when at least one kit was added (growth chime). */
  syncGrowth(sim: CitySim, changed: ReadonlyArray<TileCoord>): boolean {
    let grew = false;
    this.terrain.updateCityTiles(changed);
    for (const coord of changed) {
      const tile = sim.getTile(coord.x, coord.y);
      if (!tile) continue;
      if (tile.buildingId !== null) {
        const instance = sim.growth.buildings.get(tileKey(coord.x, coord.y));
        if (instance) {
          this.buildings.addBuilding(instance, tile.zoneType, buildingFacing(sim.map, coord.x, coord.y));
          grew = true;
        }
      } else {
        this.buildings.removeBuilding(coord.x, coord.y);
      }
    }
    if (changed.length > 0) this.onRedraw();
    return grew;
  }
}
