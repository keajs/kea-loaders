import babel from 'rollup-plugin-babel'
import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import typescript from 'rollup-plugin-typescript2'

export default [
  {
    input: './src/index.ts',
    output: { file: 'lib/index.js', format: 'cjs' },
    external: ['prop-types', 'react', 'redux', 'react-redux', 'reselect', 'kea'],
    plugins: [
      babel(),
      resolve(),
      commonjs({
        namedExports: {
          'react-is': ['isValidElementType'],
        },
      }),
      typescript({
        include: ['*.(t|j)s+(|x)', '**/*.(t|j)s+(|x)'],
      }),
    ],
  },
]
