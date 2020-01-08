import * as path from 'path';
import { runTests } from 'vscode-test';

async function main() {
    try {
        // Keep this file in sync with the Extension Tests launch tasks.

        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        const launchArgs = [
            path.resolve(__dirname, '../../src/test-fixtures/fixture1'),
            '--disable-extensions', // Don't run any other extensions.
        ];

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs,
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
