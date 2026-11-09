import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Lint dependencies live in script/, not the pnpm app tree.
const root = path.dirname(fileURLToPath(import.meta.url))
const requireFromScript = createRequire(path.join(root, 'script', 'package.json'))

async function load (id) {
  const href = pathToFileURL(requireFromScript.resolve(id)).href
  const mod = await import(href)
  return mod.default ?? mod
}

const neostandardMod = await load('neostandard')
const neostandard = neostandardMod.neostandard ?? neostandardMod
const prettierConfig = await load('eslint-config-prettier')
const globals = await load('globals')
const { globalIgnores } = await import(
  pathToFileURL(requireFromScript.resolve('eslint/config')).href
)
const prettierPlugin = await load('eslint-plugin-prettier')

export default [
  globalIgnores([
    '**/node_modules/**',
    '**/spec/fixtures/**/*.js',
    'vendor/**',
    'out/**',
    '**/*.ts',
    '**/*.tsx'
  ]),
  ...neostandard({
    env: ['browser', 'node'],
    globals: {
      atom: 'writable',
      chevron: 'writable',
      snapshotResult: 'writable'
    }
  }),
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin
    },
    rules: {
      'n/no-deprecated-api': 'off',
      'n/no-callback-literal': 'off',
      'prefer-const': 'off',
      'lines-between-class-members': 'off',
      '@stylistic/lines-between-class-members': 'off',
      'object-shorthand': 'off',
      'prettier/prettier': 'off'
    }
  },
  {
    files: ['spec/**', '**/*-spec.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        advanceClock: 'writable',
        fakeClearInterval: 'writable',
        fakeSetInterval: 'writable',
        waitsForPromise: 'writable',
        ...(globals.jasmine || {})
      }
    }
  }
]
