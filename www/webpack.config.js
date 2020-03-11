const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
  },
	mode: 'development',
	plugins: [new HtmlWebpackPlugin()],
	devServer: {
		contentBase: path.join(__dirname, 'dist'),
	},
};
