module.exports = {
  env: {
    commonjs: true,
    es6: true,
    node: true,
  },
  extends: [
    'airbnb-base',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  rules: {
    'max-len': 0,
    'no-plusplus': 0,
    'no-continue': 0,
    'no-restricted-syntax': 0,
    'no-underscore-dangle': 0,
  },
};
