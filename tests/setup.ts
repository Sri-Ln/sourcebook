import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Without this, each render leaves its tree in the document and queries start
// matching elements from a previous test — which fails in confusing ways that
// look like application bugs.
afterEach(cleanup);
