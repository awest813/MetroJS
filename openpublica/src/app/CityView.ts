import type { Scene, ShadowGenerator } from '@babylonjs/core';
import type { CitySim } from '../sim/CitySim';
import { HeightField } from '../sim/HeightField';
import { tileKey } from '../sim/ZoneGrowthSystem';
import type { TileCoord } from '../data/types';
import type { QualityLevel } from '../ui/settingsStore';
import { TerrainRenderer } from '../render/TerrainRenderer';
import { BuildingRenderer } from '../render/BuildingRenderer';
import { OverlayRenderer } from '../render/OverlayRenderer';
import { TrafficVehicleRenderer } from '../render/TrafficVehicleRenderer';
import { RoadRenderer } from '../render/RoadRenderer';
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
  onRedraw: () => void = () => {};

  constructor(
    scene: Scene,
    camera: CameraController,
    shadows: ShadowGenerator,
    sim: CitySim,
    heights: HeightField,
  ) {
    this.heights = heights;
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
    this.heights = HeightField.fromMap(sim.map);
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

  syncPaintedTile(sim: CitySim, coord: TileCoord): void {
    const tile = sim.getTile(coord.x, coord.y);
    if (!tile) return;
    this.terrain.updateCityTile(tile);
    this.roads.updateAround(sim.map, coord);
    this.vegetation.updateAround(sim.map, coord);
    this.traffic.rebuildGraph(sim.map, this.heights);
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
