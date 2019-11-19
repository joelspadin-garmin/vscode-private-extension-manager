import * as assert from 'assert';
import { afterEach, beforeEach } from 'mocha';
import { SemVer } from 'semver';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import * as extensionInfo from '../../extensionInfo';
import { NotAnExtensionError, Package, PackageState } from '../../Package';
import { Registry, RegistrySource } from '../../Registry';
import { stubExtension, stubGlobalConfiguration, stubLocalExtension, stubRemoteName } from '../stubs';

suite('Package', function() {
    vscode.window.showInformationMessage(`Start ${this.title} tests`);

    beforeEach(function() {
        // Unless a test specifies otherwise, we are not in a remote workspace.
        stubRemoteName(undefined);

        // Don't allow cached extension info to affect tests.
        extensionInfo.clearCache();
    });

    afterEach(function() {
        sinon.restore();
    });

    test('Metadata', async function() {
        stubExtension('test.test-package');

        const registry = getDummyRegistry();
        const pkg = new Package(registry, {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            displayName: 'Test Package',
            description: 'This is a test package.',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.name, 'test-package');
        assert.strictEqual(pkg.publisher, 'Test');
        assert.strictEqual(pkg.extensionId, 'test.test-package');
        assert.strictEqual(pkg.spec, 'test-package@1.2.3');
        assert.deepStrictEqual(pkg.version, new SemVer('1.2.3'));
        assert.strictEqual(pkg.displayName, 'Test Package');
        assert.strictEqual(pkg.description, 'This is a test package.');
        assert.strictEqual(pkg.registry, registry);
    });

    test('Available: no remote', async function() {
        stubExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.isInstalled, false);
        assert.strictEqual(pkg.installedVersion, null);
        assert.strictEqual(pkg.state, PackageState.Available);
    });

    test('Available: extensionKind = ui', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
            extensionKind: 'ui',
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Available);
        assert.strictEqual(pkg.isUiExtension, true);
    });

    test('Available: extensionKind = workspace', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
            extensionKind: 'workspace',
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Available);
        assert.strictEqual(pkg.isUiExtension, false);
    });

    test('Available: remote.extensionKind = ui', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');
        stubGlobalConfiguration({
            'remote.extensionKind': {
                'test.test-package': 'ui',
            },
        });

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Available);
        assert.strictEqual(pkg.isUiExtension, true);
    });

    test('Available: remote.extensionKind = workspace', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');
        stubGlobalConfiguration({
            'remote.extensionKind': {
                'test.test-package': 'workspace',
            },
        });

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Available);
        assert.strictEqual(pkg.isUiExtension, false);
    });

    test('Available: no contributions -> ui', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Available);
        assert.strictEqual(pkg.isUiExtension, true);
    });

    test('Available: main defined -> workspace', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
            main: 'out/extension.js',
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Available);
        assert.strictEqual(pkg.isUiExtension, false);
    });

    test('Available: extension dependencies -> workspace', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
            extensionDependencies: ['test.dependency'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Available);
        assert.strictEqual(pkg.isUiExtension, false);
    });

    test('Available: extension pack -> workspace', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
            extensionPack: ['test.pack1', 'test.pack2'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Available);
        assert.strictEqual(pkg.isUiExtension, false);
    });

    test('Installed: no remote', async function() {
        stubExtension('test.test-package', {
            packageJSON: {
                version: '1.2.3',
            },
        });

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.isInstalled, true);
        assert.deepStrictEqual(pkg.installedVersion, new SemVer('1.2.3'));
        assert.strictEqual(pkg.state, PackageState.Installed);
    });

    test('Installed: remote', async function() {
        stubRemoteName('test-remote');
        stubExtension('test.test-package', {
            packageJSON: {
                version: '1.2.3',
            },
        });

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.isInstalled, true);
        assert.deepStrictEqual(pkg.installedVersion, new SemVer('1.2.3'));
        assert.strictEqual(pkg.isUiExtension, false);
        assert.strictEqual(pkg.state, PackageState.InstalledRemote);
    });

    test('Installed: local', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package', {
            packageJSON: {
                version: '1.2.3',
            },
        });

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.isInstalled, true);
        assert.deepStrictEqual(pkg.installedVersion, new SemVer('1.2.3'));
        assert.strictEqual(pkg.isUiExtension, true);
        assert.strictEqual(pkg.state, PackageState.Installed);
    });

    test('Update available: no remote', async function() {
        stubExtension('test.test-package', {
            packageJSON: {
                version: '1.0.0',
            },
        });

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.isInstalled, true);
        assert.deepStrictEqual(pkg.installedVersion, new SemVer('1.0.0'));
        assert.strictEqual(pkg.state, PackageState.UpdateAvailable);
    });

    test('Update available: remote', async function() {
        stubRemoteName('test-remote');
        stubExtension('test.test-package', {
            packageJSON: {
                version: '1.0.0',
            },
        });

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.isInstalled, true);
        assert.deepStrictEqual(pkg.installedVersion, new SemVer('1.0.0'));
        assert.strictEqual(pkg.state, PackageState.UpdateAvailable);
    });

    test('Update available: local', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package', {
            packageJSON: {
                version: '1.0.0',
            },
        });

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.isInstalled, true);
        assert.deepStrictEqual(pkg.installedVersion, new SemVer('1.0.0'));
        assert.strictEqual(pkg.state, PackageState.UpdateAvailable);
    });

    test('Not an extension', async function() {
        assert.throws(() => {
            // @ts-ignore No need to use "pkg". Constructing it should throw.
            const pkg = new Package(getDummyRegistry(), {
                name: 'test-package',
                publisher: 'Test',
                version: '1.2.3',
            });
        }, NotAnExtensionError);
    });

    test('Missing name', async function() {
        assert.throws(() => {
            // @ts-ignore No need to use "pkg". Constructing it should throw.
            const pkg = new Package(getDummyRegistry(), {
                publisher: 'Test',
                version: '1.2.3',
                engines: { vscode: '1.38.0' },
                files: ['extension.vsix'],
            });
        }, TypeError);
    });

    test('Missing publisher', async function() {
        nls.config({ locale: 'pseudo' });
        stubExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Invalid);
        assert.strictEqual(pkg.errorMessage, '\uFF3BMaaniifeest iis miissiing "puubliisheer" fiieeld.\uFF3D');
    });

    test('Missing .vsix file', async function() {
        nls.config({ locale: 'pseudo' });
        stubExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
        });

        await pkg.updateState();

        assert.strictEqual(pkg.state, PackageState.Invalid);
        assert.strictEqual(
            pkg.errorMessage,
            '\uFF3BMaaniifeest iis miissiing .vsiix fiilee iin "fiilees" fiieeld.\uFF3D',
        );
    });
});

/**
 * Returns a generic `Registry` which won't function, but is sufficient for most
 * tests on `Package` objects.
 */
function getDummyRegistry() {
    return new Registry('test', RegistrySource.Workspace, {
        registry: 'localhost',
    });
}
