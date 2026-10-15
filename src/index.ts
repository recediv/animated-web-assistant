import { createInitializer } from './initialize';

export type * from './config/types';
export { validateConfig } from './config/validate';

/** Load animation code only after essential graphics pass preflight. */
export const init = createInitializer(() => import('./core/runtime'));

export default { init };
