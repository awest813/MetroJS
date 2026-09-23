import { RoadType } from '../openpublica/src/sim/CityTile';
import { roadProfile } from '../openpublica/src/sim/roadConnections';
import {
  PIER_THICKNESS,
  RAILING_HEIGHT,
  countByKind,
  isFourWay,
  isIsolated,
  roadPieces,
} from '../openpublica/src/render/roadLayout';

const NONE = { n: false, e: false, s: false, w: false };

describe('roadLayout', () => {
  it('should ring an isolated street with a pad and four curbs', () => {
    const pieces = roadPieces(RoadType.Street, NONE);
    expect(isIsolated(NONE)).toBe(true);
    expect(countByKind(pieces, 'pad')).toBe(1);
    expect(countByKind(pieces, 'arm')).toBe(0);
    expect(countByKind(pieces, 'curb')).toBe(4);
    expect(countByKind(pieces, 'rail')).toBe(0);
    expect(countByKind(pieces, 'dash')).toBe(1);
  });

  it('should run two sloped arms on a north-south street', () => {
    const n = { n: true, e: false, s: true, w: false };
    const pieces = roadPieces(RoadType.Street, n);
    expect(countByKind(pieces, 'arm')).toBe(2);
    expect(pieces.filter((p) => p.kind === 'arm').every((p) => p.slope === 'n' || p.slope === 's')).toBe(true);
    expect(countByKind(pieces, 'dash')).toBe(2);
    expect(countByKind(pieces, 'crosswalk')).toBe(0);
  });

  it('should paint crosswalks only on a four-way street', () => {
    const cross = { n: true, e: true, s: true, w: true };
    expect(isFourWay(cross)).toBe(true);
    const street = roadPieces(RoadType.Street, cross);
    expect(countByKind(street, 'arm')).toBe(4);
    expect(countByKind(street, 'crosswalk')).toBe(8);
    const trolley = roadPieces(RoadType.TrolleyAvenue, cross);
    expect(countByKind(trolley, 'crosswalk')).toBe(0);
    expect(countByKind(trolley, 'rail')).toBeGreaterThan(4);
    expect(countByKind(trolley, 'tie')).toBeGreaterThan(0);
  });

  it('should put rails only on connected trolley axes', () => {
    const east = { n: false, e: true, s: false, w: true };
    const pieces = roadPieces(RoadType.TrolleyAvenue, east);
    expect(countByKind(pieces, 'dash')).toBe(0);
    const rails = pieces.filter((p) => p.kind === 'rail');
    expect(rails.every((r) => Math.abs(r.oz) > 0.05 || r.sx >= 0.4)).toBe(true);
  });

  it('should keep trolley wider than street after the visual widen', () => {
    expect(roadProfile(RoadType.TrolleyAvenue).width).toBeGreaterThan(roadProfile(RoadType.Street).width);
  });

  it('should swap curbs for railings and hang girders and a pier on a bridge', () => {
    const ew = { n: false, e: true, s: false, w: true };
    const land = roadPieces(RoadType.Street, ew);
    const bridge = roadPieces(RoadType.Street, ew, true);
    expect(countByKind(bridge, 'curb')).toBe(0);
    expect(countByKind(bridge, 'railing')).toBe(countByKind(land, 'curb'));
    expect(bridge.filter((p) => p.kind === 'railing').every((p) => p.sy === RAILING_HEIGHT)).toBe(true);
    expect(countByKind(bridge, 'girder')).toBe(3);
    expect(countByKind(bridge, 'pier')).toBe(1);
    expect(countByKind(bridge, 'dash')).toBe(countByKind(land, 'dash'));
    // The pier wall is thin along the span and wide across it.
    const pier = bridge.find((p) => p.kind === 'pier')!;
    expect(pier.sx).toBe(PIER_THICKNESS);
    expect(pier.sz).toBeGreaterThan(pier.sx);
    expect(countByKind(land, 'pier')).toBe(0);
  });
});
