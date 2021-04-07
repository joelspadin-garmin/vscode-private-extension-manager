// @ts-check
// See https://code.visualstudio.com/api/working-with-extensions/bundling-extension

'use strict';

const path = require('path');

/** @type {import('webpack').Configuration} */
const config = {
    target: 'node',
    mode: 'none',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: 'log', // TODO: replace with WEBPACK_CLI_START_FINISH_FORCE_LOG=1 once that is supported
    },
    externals: {
        vscode: 'commonjs vscode', // the vscode module is created on-the-fly and must be excluded.
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                // pack TypeScript files with ts-loader
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                    },
                ],
            },
        ],
    },
};

module.exports = config;
