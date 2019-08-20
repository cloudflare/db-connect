import pkg from './package.json'
import typescript from 'rollup-plugin-typescript'

export default {
  input: 'src/index.ts',
  output: [
    { format: 'es', file: pkg.module },
    { format: 'cjs', file: pkg.main },
    { format: 'umd', file: pkg.browser, name: pkg.name },
  ],
  plugins: [
    typescript({lib: ['es5', 'es6', 'dom'], target: 'es5'})
  ]
}
