import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createTakeStore, takeFileName } from './takes';

describe('durable takes', () => {
  it('restores multiple WAV blobs across store instances and persists rename/delete', async () => {
    const factory = new IDBFactory();
    const store = createTakeStore(factory);
    await store.put({ id: 'one', name: 'One', blob: new Blob(['RIFF-one']), createdAt: 1 });
    await store.put({ id: 'two', name: 'Two', blob: new Blob(['RIFF-two']), createdAt: 2 });
    const reopened = createTakeStore(factory);
    let takes = await reopened.list();
    expect(takes).toHaveLength(2);
    expect(await takes[0].blob.text()).toBe('RIFF-one');
    await reopened.put({ ...takes[0], name: 'Renamed' });
    await reopened.remove('two');
    takes = await createTakeStore(factory).list();
    expect(takes.map((take) => take.name)).toEqual(['Renamed']);
  });

  it('reports unavailable storage instead of pretending to save', async () => {
    await expect(createTakeStore(null).list()).rejects.toThrow('unavailable');
    await expect(createTakeStore(null).put({ id: 'one' })).rejects.toThrow('unavailable');
  });

  it('preserves Unicode and sanitizes unsafe download names', () => {
    expect(takeFileName('\ud14c\uc2a4\ud2b8.wav')).toBe('\ud14c\uc2a4\ud2b8.wav');
    expect(takeFileName('bad/"name\n')).toBe('bad--name-.wav');
    expect(takeFileName('  ')).toBe('voice-take.wav');
  });
});
