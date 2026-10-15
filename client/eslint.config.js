import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'jest.config.cjs']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Generated shadcn primitives export variants/hooks next to components
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // One calm color system: feedback and meaning use the semantic tones (danger, success, warning, info),
    // never raw red / green / emerald / rose / amber utilities. See DESIGN.md → Color.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/pages/design-system/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\\b(bg|text|border|ring|fill|stroke|outline|divide|from|to|via|decoration|accent|placeholder|shadow)-(red|green|emerald|rose|amber)-[0-9]/]',
          message: 'Use a semantic tone (bg-danger-bg, text-success-fg, bg-warning-dot, ...) instead of a raw red/green/emerald/rose/amber utility.',
        },
        {
          selector: 'TemplateElement[value.raw=/\\b(bg|text|border|ring|fill|stroke|outline|divide|from|to|via|decoration|accent|placeholder|shadow)-(red|green|emerald|rose|amber)-[0-9]/]',
          message: 'Use a semantic tone (bg-danger-bg, text-success-fg, bg-warning-dot, ...) instead of a raw red/green/emerald/rose/amber utility.',
        },
      ],
    },
  },
  {
    // Generated shadcn hook: syncs the initial media query value in an effect
    files: ['src/hooks/use-mobile.ts'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
