import type { Stretch } from './extend';

/**
 * Pass 5 lengthened every mission by splicing a new stretch of road into it (see `extend.ts`). Stage 6 rebuilt all ten missions as
 * self-contained routes, so no stretch is applied any more; the registry and the extension machinery are kept for any mission that
 * is ever authored short again.
 */
export const EXTENSIONS: Record<string, Stretch> = {};
