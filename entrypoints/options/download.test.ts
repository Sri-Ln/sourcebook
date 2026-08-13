import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download.js';

describe('downloadText', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubObjectUrl() {
    const createObjectURL = vi.fn().mockReturnValue('blob:stub');
    const revokeObjectURL = vi.fn();

    // jsdom implements neither, so they are stubbed rather than worked around
    // in production code — a real browser is the only place this can run.
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));

    return { createObjectURL, revokeObjectURL };
  }

  it('offers the file under the name it was given', () => {
    stubObjectUrl();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('sourcebook-2026-08-13.json');
      expect(this.href).toBe('blob:stub');
    });

    downloadText('sourcebook-2026-08-13.json', '{}');

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('leaves no anchor behind in the document', () => {
    stubObjectUrl();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadText('x.json', '{}');

    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('releases the blob rather than pinning it for the life of the page', async () => {
    const { revokeObjectURL } = stubObjectUrl();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadText('x.json', '{}');

    // Deferred: revoking in the same tick as the click cancels the download in
    // some browsers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stub');
  });
});
