// Lets the render modules' bare `import 'three'` resolve to the vendored copy under Node.
import { register } from 'node:module';
const hooks = 'data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../../vendor/three/three.module.min.js', ${JSON.stringify(import.meta.url)}).href, shortCircuit: true };
  return next(specifier, context);
}`);
register(hooks);
