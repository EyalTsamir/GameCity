// Module "lamps": bakes the night street-light map (see core/lampLight.ts) and drives its gain.
// Loaded right after "props", so every static light source has been registered by then; the
// bake itself waits for 'modules:ready'.
//
// STUB (lead): the night-lighting owner replaces this with the real baker.

import type { CityContext, CityModule } from '../core/context';
import { lampLights } from '../core/lampLight';

export default function create(ctx: CityContext): CityModule {
  return {
    name: 'lamps',
    frame() {
      ctx.uniforms.uLampGain.value = 0;
    },
    stats() {
      return { registered: lampLights().length };
    },
  };
}
