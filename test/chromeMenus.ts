import {
  SETTINGS_SHORTCUTS,
  cityFileNote,
  formatBudgetNet,
  formatPopulation,
  formatSignedMoney,
} from '../openpublica/src/ui/chromeCopy';
import {
  AMBIENT_OCCLUSION_STORAGE_KEY,
  DEFAULT_DAY,
  QUALITY_STORAGE_KEY,
  SUN_STORAGE_KEY,
  ambientOcclusionActive,
  readStoredAmbientOcclusion,
  readStoredQuality,
  readStoredSun,
  writeStoredAmbientOcclusion,
  writeStoredQuality,
  writeStoredSun,
} from '../openpublica/src/ui/settingsStore';

describe('chromeCopy', () => {
  it('should list save and cancel shortcuts in Settings', () => {
    expect(SETTINGS_SHORTCUTS).toMatch(/Ctrl\+S save/);
    expect(SETTINGS_SHORTCUTS).toMatch(/Esc/);
    expect(SETTINGS_SHORTCUTS).toMatch(/Home frame/);
    expect(SETTINGS_SHORTCUTS).toMatch(/G plant/);
    expect(SETTINGS_SHORTCUTS).toMatch(/O police/);
    expect(SETTINGS_SHORTCUTS).toMatch(/F fire/);
    expect(SETTINGS_SHORTCUTS).toMatch(/C shops/);
    expect(SETTINGS_SHORTCUTS).toMatch(/N industry/);
    expect(SETTINGS_SHORTCUTS).toMatch(/U mixed/);
    expect(SETTINGS_SHORTCUTS).toMatch(/M mute/);
  });

  it('should mark dark residents in the population readout', () => {
    expect(formatPopulation(0, 0)).toBe('Pop 0');
    expect(formatPopulation(27, 0)).toBe('Pop 27');
    expect(formatPopulation(15, 15)).toBe('Pop 15 dark');
    expect(formatPopulation(27, 12)).toBe('Pop 27 · 12 dark');
  });

  it('should describe city file state', () => {
    expect(cityFileNote(false, false)).toBe('No save yet.');
    expect(cityFileNote(true, false)).toBe('Save kept in this browser.');
    expect(cityFileNote(true, true)).toBe('Saved in this browser.');
  });

  it('should format budget net including a deficit', () => {
    expect(formatSignedMoney(40)).toBe('$40');
    expect(formatSignedMoney(-15)).toBe('-$15');
    expect(formatBudgetNet(100, 40)).toBe('+$60/mo');
    expect(formatBudgetNet(40, 40)).toBe('$0/mo');
    expect(formatBudgetNet(10, 25)).toBe('-$15/mo');
  });
});

describe('settingsStore', () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: store,
    });
  });

  it('should default quality to high and sun to noon-ish', () => {
    expect(readStoredQuality()).toBe('high');
    expect(readStoredSun()).toBe(DEFAULT_DAY);
  });

  it('should persist quality and sun', () => {
    writeStoredQuality('low');
    writeStoredSun(1);
    expect(memory.get(QUALITY_STORAGE_KEY)).toBe('low');
    expect(memory.get(SUN_STORAGE_KEY)).toBe('1');
    expect(readStoredQuality()).toBe('low');
    expect(readStoredSun()).toBe(1);
  });

  it('should clamp sun into 0–1', () => {
    writeStoredSun(4);
    expect(readStoredSun()).toBe(1);
    writeStoredSun(-2);
    expect(readStoredSun()).toBe(0);
  });

  it('should keep ambient occlusion off until the player turns it on', () => {
    expect(readStoredAmbientOcclusion()).toBe(false);
    writeStoredAmbientOcclusion(true);
    expect(memory.get(AMBIENT_OCCLUSION_STORAGE_KEY)).toBe('on');
    expect(readStoredAmbientOcclusion()).toBe(true);
    writeStoredAmbientOcclusion(false);
    expect(readStoredAmbientOcclusion()).toBe(false);
  });

  it('should draw ambient occlusion only on High, when wanted and supported, with no map on', () => {
    const on = { quality: 'high' as const, wanted: true, supported: true, mapShown: false };
    expect(ambientOcclusionActive(on)).toBe(true);
    expect(ambientOcclusionActive({ ...on, quality: 'low' })).toBe(false);
    expect(ambientOcclusionActive({ ...on, wanted: false })).toBe(false);
    expect(ambientOcclusionActive({ ...on, supported: false })).toBe(false);
    expect(ambientOcclusionActive({ ...on, mapShown: true })).toBe(false);
  });
});
