import * as assert from 'assert';
import { before } from 'mocha';
import 'source-map-support/register';
import * as vscode from 'vscode';

const EXTENSION_NAME = 'private-extension-manager-remote-helper';
const PUBLISHER_ID = 'garmin';
const EXTENSION_ID = `${PUBLISHER_ID}.${EXTENSION_NAME}`;

suite('Extension Test Suite', function () {
    vscode.window.showInformationMessage('Start all tests.');

    before(function () {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);

        if (!extension) {
            throw Error(`${EXTENSION_ID} must be installed.`);
        }

        if (extension.extensionKind !== vscode.ExtensionKind.UI) {
            throw Error('Tests must not be executed from remote machine.');
        }
    });

    test('Get Package JSON', async function () {
        const extension = await vscode.commands.executeCommand<Partial<vscode.Extension<any>>>(
            '_privateExtensionManager.remoteHelper.getExtension',
            EXTENSION_ID,
        );

        assert.notStrictEqual(extension, undefined);
        assert.strictEqual(extension?.id?.toLowerCase(), EXTENSION_ID);
        assert.strictEqual(extension?.extensionKind, vscode.ExtensionKind.UI);
        assert.strictEqual(extension?.packageJSON.name, EXTENSION_NAME);
        assert.strictEqual(extension?.packageJSON.publisher, PUBLISHER_ID);
        assert.strictEqual(typeof extension?.packageJSON.version, 'string');
    });

    test('Get Platform', async function () {
        const platform = await vscode.commands.executeCommand<string>(
            '_privateExtensionManager.remoteHelper.getPlatform',
        );

        assert.strictEqual(platform, process.platform);
    });
});
