import * as assert from 'assert';
import { before } from 'mocha';
import * as vscode from 'vscode';

suite('Extension Test Suite', function() {
    vscode.window.showInformationMessage('Start all tests.');

    before(function() {
        const extension = vscode.extensions.getExtension('garmin.private-extension-manager-remote-helper');

        if (!extension) {
            throw Error('garmin.private-extension-manager-remote-helper must be installed.');
        }

        if (extension.extensionKind !== vscode.ExtensionKind.UI) {
            throw Error('Tests must not be executed from remote machine.');
        }
    });

    test('Get Package JSON', async function() {
        const extension = await vscode.commands.executeCommand<Partial<vscode.Extension<any>>>(
            '_privateExtensionManager.remoteHelper.getExtension',
            'garmin.private-extension-manager-remote-helper',
        );

        assert.notStrictEqual(extension, undefined);
        assert.strictEqual(extension?.id?.toLowerCase(), 'garmin.private-extension-manager-remote-helper');
        assert.strictEqual(extension?.extensionKind, vscode.ExtensionKind.UI);
        assert.strictEqual(extension?.packageJSON.name, 'private-extension-manager-remote-helper');
        assert.strictEqual(extension?.packageJSON.publisher, 'garmin');
        assert.strictEqual(typeof extension?.packageJSON.version, 'string');
    });

    test('Get Platform', async function() {
        const platform = await vscode.commands.executeCommand<string>(
            '_privateExtensionManager.remoteHelper.getPlatform',
        );

        assert.strictEqual(platform, process.platform);
    });
});
