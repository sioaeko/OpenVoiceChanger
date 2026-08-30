import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// constants.js derives WS_URL from `location` at module scope, which Node does
// not provide — stub it before the module graph is evaluated.
let convertFile;
let fetchGitHubStarState;
let starGitHubRepository;

beforeAll(async () => {
  globalThis.location = { protocol: 'http:', host: 'localhost:8000' };
  ({ convertFile, fetchGitHubStarState, starGitHubRepository } = await import('./api'));
});

function mockFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
  }));
  globalThis.fetch = fetchMock;
  return fetchMock;
}

function sentForm(fetchMock) {
  return fetchMock.mock.calls[0][1].body;
}

const FILE = new File([new Uint8Array(8)], 'take.wav', { type: 'audio/wav' });

describe('convertFile', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = mockFetch();
  });

  it('sends the advanced RVC controls with the render', async () => {
    await convertFile(FILE, {
      pitchShift: 3,
      formantShift: -2,
      f0Method: 'rmvpe',
      effects: { reverb: { enabled: true } },
      useModel: true,
      indexRate: 0.4,
      filterRadius: 5,
      rmsMixRate: 0.8,
      protect: 0.2,
    });

    const form = sentForm(fetchMock);
    expect(form.get('index_rate')).toBe('0.4');
    expect(form.get('filter_radius')).toBe('5');
    expect(form.get('rms_mix_rate')).toBe('0.8');
    expect(form.get('protect')).toBe('0.2');
  });

  it('still sends the pre-existing fields', async () => {
    await convertFile(FILE, {
      pitchShift: 3,
      formantShift: -2,
      f0Method: 'rmvpe',
      effects: { reverb: { enabled: true } },
      useModel: false,
    });

    const form = sentForm(fetchMock);
    expect(form.get('pitch_shift')).toBe('3');
    expect(form.get('formant_shift')).toBe('-2');
    expect(form.get('f0_method')).toBe('rmvpe');
    expect(form.get('use_model')).toBe('false');
    expect(JSON.parse(form.get('effects'))).toEqual({ reverb: { enabled: true } });
    expect(form.get('file')).toBeTruthy();
  });

  it('omits advanced fields that are absent so the server default applies', async () => {
    await convertFile(FILE, { pitchShift: 0 });

    const form = sentForm(fetchMock);
    for (const field of ['index_rate', 'filter_radius', 'rms_mix_rate', 'protect']) {
      expect(form.get(field)).toBeNull();
    }
  });

  it('omits unusable values rather than sending an empty field', async () => {
    // An empty string would fail server-side coercion with a 422.
    await convertFile(FILE, {
      indexRate: '',
      filterRadius: null,
      rmsMixRate: undefined,
      protect: NaN,
    });

    const form = sentForm(fetchMock);
    for (const field of ['index_rate', 'filter_radius', 'rms_mix_rate', 'protect']) {
      expect(form.get(field)).toBeNull();
    }
  });

  it('sends a legitimate zero', async () => {
    await convertFile(FILE, { indexRate: 0, protect: 0 });

    const form = sentForm(fetchMock);
    expect(form.get('index_rate')).toBe('0');
    expect(form.get('protect')).toBe('0');
  });

  it('posts to the convert endpoint', async () => {
    await convertFile(FILE, {});
    expect(fetchMock.mock.calls[0][0]).toBe('/api/convert/');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('surfaces a server error detail', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 413,
      statusText: 'Payload Too Large',
      json: async () => ({ detail: 'Audio too long (max 10 minutes)' }),
    }));

    await expect(convertFile(FILE, {})).rejects.toThrow('Audio too long (max 10 minutes)');
  });
});

describe('GitHub star API', () => {
  it('reads the active account star state', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ available: true, starred: false }),
    }));

    await expect(fetchGitHubStarState()).resolves.toEqual({ available: true, starred: false });
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/github/star');
  });

  it('posts an explicit user-action header when starring', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ available: true, starred: true }),
    }));

    await expect(starGitHubRepository()).resolves.toEqual({ available: true, starred: true });
    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['X-OpenVoiceChanger-Action']).toBe('star');
  });
});
