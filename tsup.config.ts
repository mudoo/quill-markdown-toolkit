import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/conversion.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: true,
  // Rollup handles the ESM defaults of Quill and its formats in CommonJS output.
  treeshake: true,
  external: ['quill'],
})
