const path = require('path');
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin');

module.exports = {
	webpack(config) {
		config.plugins.push(new WasmPackPlugin({
			crateDirectory: __dirname,
			forceWatch: false,
		}));
		config.resolve.alias['&'] = path.resolve(__dirname, 'pkg');

		return config;
	},
}
