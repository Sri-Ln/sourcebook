import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchUrlChanges } from './watchUrlChanges.js';

describe('watchUrlChanges', () => {
  const stops: Array<() => void> = [];

  function watch(onChange: (url: string) => void) {
    const stop = watchUrlChanges(onChange);
    stops.push(stop);
    return stop;
  }

  afterEach(() => {
    while (stops.length) stops.pop()?.();
    history.replaceState(null, '', '/');
  });

  it('fires on pushState, which is how LinkedIn navigates', () => {
    const onChange = vi.fn();
    watch(onChange);

    history.pushState(null, '', '/in/jane-placeholder/');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('/in/jane-placeholder/'));
  });

  it('fires on replaceState', () => {
    const onChange = vi.fn();
    watch(onChange);

    history.replaceState(null, '', '/jobs/view/123/');

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('fires on back navigation, so history moves are covered too', () => {
    // Simulates precisely what a browser does on Back: the URL changes outside
    // our wrappers, then popstate fires. Driving jsdom's history.back() instead
    // would make this a test of jsdom's event timing rather than of the watcher.
    const changeUrlSilently = history.replaceState.bind(history);

    const onChange = vi.fn();
    watch(onChange);

    history.pushState(null, '', '/in/two/');
    onChange.mockClear();

    changeUrlSilently(null, '', '/in/one/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('/in/one/'));
  });

  it('ignores a popstate that did not actually change the URL', () => {
    const onChange = vi.fn();
    watch(onChange);

    history.pushState(null, '', '/in/jane/');
    onChange.mockClear();

    window.dispatchEvent(new PopStateEvent('popstate'));

    // Re-mounting on a no-op would tear down a button mid-click.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores navigation that does not change the URL', () => {
    const onChange = vi.fn();
    watch(onChange);

    history.pushState(null, '', '/in/jane/');
    onChange.mockClear();

    // LinkedIn pushes state redundantly. Re-mounting on a no-op would tear
    // down and rebuild a button the user may be mid-click on.
    history.pushState(null, '', '/in/jane/');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('still performs the navigation it wraps', () => {
    watch(vi.fn());

    history.pushState(null, '', '/jobs/search/?currentJobId=42');

    expect(location.pathname + location.search).toBe('/jobs/search/?currentJobId=42');
  });

  it('stops firing once stopped', () => {
    const onChange = vi.fn();
    const stop = watch(onChange);

    stop();
    history.pushState(null, '', '/in/after-stop/');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores the original history methods when stopped', () => {
    const originalPush = history.pushState;
    const stop = watch(vi.fn());

    expect(history.pushState).not.toBe(originalPush);

    stop();
    expect(history.pushState).toBe(originalPush);
  });

  it('supports two watchers without either breaking the other', () => {
    const first = vi.fn();
    const second = vi.fn();
    watch(first);
    watch(second);

    history.pushState(null, '', '/in/both/');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
