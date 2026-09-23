import { refinePickOnDecks } from '../openpublica/src/render/deckPick';

describe('refinePickOnDecks', () => {
  // Camera up and to the south, looking north and down.
  const origin = { x: 5.5, y: 6, z: -2 };

  it('should keep the hit tile when no deck is in the way', () => {
    const hit = { x: 5.5, y: 0.06, z: 4.2 };
    expect(refinePickOnDecks(origin, hit, () => null)).toEqual({ x: 5, y: 4 });
  });

  it('should hand the click to a bridge deck the ray crosses first', () => {
    // The water hit is at z 4.2, but a deck at y 0.35 over tile (5, 3)
    // intercepts the ray about a third of a tile nearer the camera.
    const hit = { x: 5.5, y: 0.06, z: 4.2 };
    const deck = (x: number, y: number): number | null => (x === 5 && y === 3 ? 0.35 : null);
    expect(refinePickOnDecks(origin, hit, deck)).toEqual({ x: 5, y: 3 });
  });

  it('should keep the hit when the deck is behind it', () => {
    const hit = { x: 5.5, y: 0.06, z: 4.2 };
    const deck = (x: number, y: number): number | null => (x === 5 && y === 6 ? 0.35 : null);
    expect(refinePickOnDecks(origin, hit, deck)).toEqual({ x: 5, y: 4 });
  });

  it('should take the deck tile itself when the hit is already under it', () => {
    const hit = { x: 5.5, y: 0.06, z: 3.6 };
    const deck = (x: number, y: number): number | null => (x === 5 && y === 3 ? 0.35 : null);
    expect(refinePickOnDecks(origin, hit, deck)).toEqual({ x: 5, y: 3 });
  });
});
