module.exports = {
  root: true,
  parser: '@typescript-eslint/parser', // we need to install @typescript-eslint/parser and @typescript-eslint/eslint-plugin
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2020: true,
  },
  ignorePatterns: ['node_modules/', 'dist/', '.wrangler/'],
};
