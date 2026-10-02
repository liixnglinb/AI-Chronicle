export default {
  '*.{ts,tsx}': ['oxlint', 'prettier --write'],
  '*.{cjs,mjs,js}': ['oxlint', 'prettier --write'],
  '*.{css,json,html,yml,yaml}': ['prettier --write'],
  '*.md': ['prettier --write'],
}
