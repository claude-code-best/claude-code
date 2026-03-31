// Preload: registers bun:bundle as a virtual module for dev mode
import { plugin } from 'bun';

plugin({
  name: 'bun-bundle-polyfill',
  setup(build) {
    build.module('bun:bundle', () => ({
      exports: { feature: (_name: string) => false },
      loader: 'object',
    }));
  },
});
