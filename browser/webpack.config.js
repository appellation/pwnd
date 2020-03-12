const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin');

module.exports = {
	entry: './src/index.js',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'index.js',
	},
	mode: 'development',
	plugins: [
		new HtmlWebpackPlugin(),
		new WasmPackPlugin({
			crateDirectory: __dirname,
		}),
	],
	devServer: {
		contentBase: path.join(__dirname, 'dist'),
	},
};
