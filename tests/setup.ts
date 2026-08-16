// Registers matchers like toBeDisabled and toBeVisible. Installed with the
// other testing-library packages but never wired up until a test actually
// reached for one — at which point it failed as "Invalid Chai property".
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Without this, each render leaves its tree in the document and queries start
// matching elements from a previous test — which fails in confusing ways that
// look like application bugs.
afterEach(cleanup);

/**
 * jsdom is inconsistent about the popover API: it honours the attribute's
 * hidden semantics but does not implement `showPopover`, so a popover can never
 * become visible there. Real browsers ship both together.
 *
 * Shimmed rather than querying with `hidden: true`, which would make the tests
 * pass against markup no user could see.
 */
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.showPopover) {
  HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
    this.style.display = 'block';
  };
  HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
    this.style.display = '';
  };
}
