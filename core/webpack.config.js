const path = require('path');
const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin");

module.exports = {
  mode: 'production',
  entry: './src/browser.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'pwnd',
    libraryTarget: 'umd',
  },
  node: {
    os: true,
  },
  plugins: [
    new WasmPackPlugin({
      crateDirectory: __dirname,
      extraArgs: '--no-typescript',
    }),
  ],
};
