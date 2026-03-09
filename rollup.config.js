import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { string } from 'rollup-plugin-string';

export default {
  input: 'src/ld2450-radar-card.ts',
  output: {
    file: 'dist/ld2450-radar-card.js',
    format: 'es',
    sourcemap: false,
  },
  plugins: [
    resolve(),
    string({
      include: ['**/*.css'],
    }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      sourceMap: false,
    }),
  ],
};
