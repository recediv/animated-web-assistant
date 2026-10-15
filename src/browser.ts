import { createInitializer } from './initialize';

export { validateConfig } from './config/validate';

// Capture the classic script URL now: currentScript is null when init is called later.
const scriptUrl =
  typeof document === 'undefined' ? '' : document.currentScript?.getAttribute('src');
const runtimeUrl = scriptUrl
  ? new URL('runtime.js', new URL(scriptUrl, document.baseURI)).href
  : null;

/** Keep the classic-script loader small instead of inlining all animation code. */
export const init = createInitializer(() =>
  runtimeUrl
    ? import(/* @vite-ignore */ runtimeUrl)
    : Promise.reject(new Error('Character loader must be loaded from an external script')),
);

export default { init };
