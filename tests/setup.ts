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
