// @ts-check
// See https://code.visualstudio.com/api/working-with-extensions/bundling-extension

'use strict';

const fs = require('fs');
const glob = require('glob');
const path = require('path');
const template = require('lodash.template');
const IgnorePlugin = require('webpack').IgnorePlugin;
const NormalModuleReplacementPlugin = require('webpack').NormalModuleReplacementPlugin;
const LicenseCheckerWebpackPlugin = require('license-checker-webpack-plugin');

// See https://spdx.org/licenses/
const allowedLicenses = ['Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC-BY-3.0+', 'CC0-1.0', 'ISC', 'MIT', 'WTFPL'];

/** @type {import('webpack').Configuration} */
const extensionConfig = {
    name: 'extension',
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
        extensions: ['.ts', '.js', '.json'],
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
    plugins: [
        // worker_threads will never be imported. We can safely ignore it.
        new IgnorePlugin({ resourceRegExp: /^worker_threads$/ }),
        // We don't need iconv-loader, but it *will* be imported, so we need the
        // import to succeed but not do anything.
        new NormalModuleReplacementPlugin(/\/iconv-loader$/, 'node-noop'),
        // Pacote tries to use node-gyp to run NPM if a fetched package has a
        // prepare script. That can't be webpacked, so stub it out.
        new NormalModuleReplacementPlugin(
            /^@npmcli\/run-script$/,
            path.resolve(__dirname, 'src/stubs/@npmcli/run-script.js'),
        ),
        // Write a file containing all third-party license information.
        new LicenseCheckerWebpackPlugin({
            allow: `(${allowedLicenses.join(' OR ')})`,
            outputFilename: 'ThirdPartyNotices.txt',
            emitError: true,
            override: {
                'valid-url@1.0.9': { licenseName: 'MIT' }, // https://github.com/ogt/valid-url/blob/master/LICENSE
            },
            outputWriter: writeThirdPartyNotices,
        }),
    ],
};

/** @type {import('webpack').Configuration} */
const webviewConfig = {
    name: 'webview',
    target: 'web',
    mode: 'none',
    entry: {
        'extension-details': './src/views/extension-details/index.ts',
    },
    devtool: 'nosources-source-map',
    output: {
        filename: 'assets/[name]/index.js',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'window',
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

module.exports = [extensionConfig, webviewConfig];

/**
 * Like LicenseCheckerWebpackPlugin's default output writer, but also appends
 * all the files in the `licenses` directory so we include licenses for media
 * and other resources that aren't an explicit package dependency.
 *
 * @param {{ dependencies: LicenseCheckerWebpackPlugin.Dependency[] }} dependencies
 */
function writeThirdPartyNotices({ dependencies }) {
    const templateFile = path.resolve(__dirname, './src/thirdPartyNotices.ejs');
    const writer = template(fs.readFileSync(templateFile, { encoding: 'utf8' }));

    const extraLicenseFiles = glob.sync('licenses/**', { nodir: true });
    const extraLicenses = extraLicenseFiles.map((file) => fs.readFileSync(file, { encoding: 'utf8' }));

    return writer({ dependencies, extraLicenses });
}
