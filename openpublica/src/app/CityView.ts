import type { Scene, ShadowGenerator } from '@babylonjs/core';
import type { CitySim } from '../sim/CitySim';
import { TerrainType } from '../sim/CityTile';
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
import type { SurfaceHeights } from '../render/HighlightRenderer';
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
      if (tile) this.buildings.addBuilding(instance, tile.zoneType);
    }

    this.refreshPowerVisuals(sim);
    this.traffic.rebuildGraph(sim.map, this.heights);
    this.onRedraw();
  }

  /**
   * Refresh meshes after a tool changed one tile. The traffic graph was
   * already rebuilt by the sim's onTrafficChanged for the same edit.
   */
  syncPaintedTile(sim: CitySim, coord: TileCoord): void {
    const tile = sim.getTile(coord.x, coord.y);
    if (!tile) return;
    this.terrain.updateCityTile(tile);
    this._regradeAround(sim, coord);
    this.roads.updateAround(sim.map, coord);
    this.overlay.updateTiles(sim.map, deckDirtyTiles(sim.map, coord.x, coord.y));
    this.vegetation.updateAround(sim.map, coord);
    if (tile.buildingId === 'small_power_plant' || tile.buildingId === null) {
      this.smoke.rebuild(sim.map, this.heights);
    }
    if (tile.buildingId === null) {
      this.buildings.removeBuilding(coord.x, coord.y);
    } else {
      const instance = sim.growth.buildings.get(tileKey(coord.x, coord.y));
      if (instance) {
        this.buildings.addBuilding(instance, tile.zoneType);
      }
    }
    this.refreshPowerVisuals(sim);
    this.onRedraw();
  }

  /**
   * A road appeared or went away: grade the ground under it and move
   * everything that stands on the tiles whose corners shifted.
   */
  private _regradeAround(sim: CitySim, coord: TileCoord): void {
    const moved = this.heights.regrade(sim.map, coord.x, coord.y, coord.x, coord.y);
    if (moved.length === 0) return;
    const map = sim.map;
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
    for (const coord of changed) {
      const tile = sim.getTile(coord.x, coord.y);
      if (!tile) continue;
      this.terrain.updateCityTile(tile);
      if (tile.buildingId !== null) {
        const instance = sim.growth.buildings.get(tileKey(coord.x, coord.y));
        if (instance) {
          this.buildings.addBuilding(instance, tile.zoneType);
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
