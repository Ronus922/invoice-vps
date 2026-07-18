import next from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'dist/**', 'scripts/**'] },
  ...next,
  ...nextTs,
  {
    // The React-Compiler rules that Next 16 newly ships as errors flag common,
    // correct patterns in this codebase (SSR-safe setState on mount, latest-value
    // refs, reset-on-prop-change) rather than real bugs. Keep them visible as
    // warnings; rules-of-hooks / exhaustive-deps stay errors and catch real bugs.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
]

export default config
