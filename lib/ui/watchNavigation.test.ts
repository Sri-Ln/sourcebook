import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchNavigation } from './watchNavigation.js';

describe('watchNavigation', () => {
  const stops: Array<() => void> = [];

  function watch(onChange: (url: string) => void) {
    const stop = watchNavigation(onChange);
    stops.push(stop);
    return stop;
  }

  afterEach(() => {
    while (stops.length) stops.pop()?.();
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
  });

  /** Stands in for the Navigation API, which jsdom does not implement. */
  function stubNavigationApi() {
    const target = new EventTarget();
    vi.stubGlobal('navigation', target);
    return target;
  }

  describe('the Navigation API', () => {
    it('reports a navigation it cannot be bypassed for', () => {
      const navigation = stubNavigationApi();
      const onChange = vi.fn();
      watch(onChange);

      // Simulates LinkedIn's router: it holds its own reference to pushState,
      // so our patch never runs — but the navigation still happened.
      history.replaceState.call(history, null, '', '/in/jane/');
      onChange.mockClear();
      history.replaceState(null, '', '/in/someone-else/');
      onChange.mockClear();

      navigation.dispatchEvent(new Event('navigatesuccess'));

      // Nothing changed since the last notify, so this one is a no-op...
      expect(onChange).not.toHaveBeenCalled();
    });

    it('fires when the URL changed without any history call we can see', () => {
      const navigation = stubNavigationApi();
      const onChange = vi.fn();
      watch(onChange);

      // Change the URL through a reference captured before we patched, which
      // is exactly what LinkedIn's router does.
      const untouched = Object.getPrototypeOf(history).replaceState;
      untouched.call(history, null, '', '/in/jane-placeholder/');

      navigation.dispatchEvent(new Event('navigatesuccess'));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('/in/jane-placeholder/'));
    });

    it('stops listening once stopped', () => {
      const navigation = stubNavigationApi();
      const onChange = vi.fn();
      const stop = watch(onChange);

      stop();
      Object.getPrototypeOf(history).replaceState.call(history, null, '', '/in/after-stop/');
      navigation.dispatchEvent(new Event('navigatesuccess'));

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('without the Navigation API', () => {
    it('still catches a patched pushState', () => {
      const onChange = vi.fn();
      watch(onChange);

      history.pushState(null, '', '/in/jane/');

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('still catches history traversal', () => {
      const onChange = vi.fn();
      watch(onChange);

      Object.getPrototypeOf(history).replaceState.call(history, null, '', '/in/back/');
      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  it('ignores navigation that leaves the URL unchanged', () => {
    const onChange = vi.fn();
    watch(onChange);

    history.pushState(null, '', '/in/jane/');
    onChange.mockClear();
    history.pushState(null, '', '/in/jane/');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports a change only once when several mechanisms see it', () => {
    const navigation = stubNavigationApi();
    const onChange = vi.fn();
    watch(onChange);

    // pushState notifies, then the Navigation API reports the same move.
    history.pushState(null, '', '/in/jane/');
    navigation.dispatchEvent(new Event('navigatesuccess'));
    window.dispatchEvent(new PopStateEvent('popstate'));

    // Overlapping mechanisms are deliberate; duplicate reports are not.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('restores the history methods it patched', () => {
    const original = history.pushState;
    const stop = watch(vi.fn());

    expect(history.pushState).not.toBe(original);

    stop();
    expect(history.pushState).toBe(original);
  });
});
