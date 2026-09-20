import {
  SETTINGS_SHORTCUTS,
  cityFileNote,
  formatBudgetNet,
  formatSignedMoney,
} from '../openpublica/src/ui/chromeCopy';
import {
  DEFAULT_DAY,
  QUALITY_STORAGE_KEY,
  SUN_STORAGE_KEY,
  readStoredQuality,
  readStoredSun,
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
  });

  it('should describe city file state', () => {
    expect(cityFileNote(false, false)).toBe('No save yet.');
    expect(cityFileNote(true, false)).toBe('Save kept in this browser.');
    expect(cityFileNote(true, true)).toBe('Saved in this browser.');
  });

  it('should format budget net including a deficit', () => {
    expect(formatSignedMoney(40)).toBe('$40');
    expect(formatSignedMoney(-15)).toBe('-$15');
    expect(formatBudgetNet(100, 40)).toBe('$60/mo');
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
});
