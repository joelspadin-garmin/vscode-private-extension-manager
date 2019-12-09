import { assert } from 'chai';
import { afterEach, beforeEach } from 'mocha';
import { SemVer } from 'semver';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import * as extensionInfo from '../../extensionInfo';
import { NotAnExtensionError, Package, PackageState } from '../../Package';
import { Registry, RegistrySource } from '../../Registry';
import { stubExtension, stubGlobalConfiguration, stubLocalExtension, stubRemoteName } from '../stubs';

nls.config({ locale: 'pseudo' });

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

        assert.deepInclude(pkg, {
            name: 'test-package',
            publisher: 'Test',
            extensionId: 'test.test-package',
            spec: 'test-package@1.2.3',
            version: new SemVer('1.2.3'),
            displayName: 'Test Package',
            description: 'This is a test package.',
            registry: registry,
        });
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

        assert.deepInclude(pkg, {
            isInstalled: false,
            installedVersion: null,
            state: PackageState.Available,
        });
    });

    test('Available: extensionKind = [ui]', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
            extensionKind: ['ui'],
        });

        await pkg.updateState();

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: true,
        });
    });

    test('Available: extensionKind = [ui, workspace]', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
            extensionKind: ['ui', 'workspace'],
        });

        await pkg.updateState();

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: true,
        });
    });

    test('Available: extensionKind = [workspace]', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
            extensionKind: ['workspace'],
        });

        await pkg.updateState();

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: false,
        });
    });

    // Backwards compatibility with old type for extensionKind.
    test('Available: extensionKind = "ui"', async function() {
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: true,
        });
    });

    // Backwards compatibility with old type for extensionKind.
    test('Available: extensionKind = "workspace"', async function() {
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: false,
        });
    });

    test('Available: remote.extensionKind = [ui]', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');
        stubGlobalConfiguration({
            'remote.extensionKind': {
                'test.test-package': ['ui'],
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: true,
        });
    });

    test('Available: remote.extensionKind = [ui, workspace]', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');
        stubGlobalConfiguration({
            'remote.extensionKind': {
                'test.test-package': ['ui', 'workspace'],
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: true,
        });
    });

    test('Available: remote.extensionKind = [workspace]', async function() {
        stubRemoteName('test-remote');
        stubLocalExtension('test.test-package');
        stubGlobalConfiguration({
            'remote.extensionKind': {
                'test.test-package': ['workspace'],
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: false,
        });
    });

    // Backwards compatibility with old type for extensionKind.
    test('Available: remote.extensionKind = "ui"', async function() {
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: true,
        });
    });

    // Backwards compatibility with old type for extensionKind.
    test('Available: remote.extensionKind = "workspace"', async function() {
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: false,
        });
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: false,
        });
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: false,
        });
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

        assert.deepInclude(pkg, {
            state: PackageState.Available,
            isUiExtension: false,
        });
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

        assert.deepInclude(pkg, {
            isInstalled: true,
            installedVersion: new SemVer('1.2.3'),
            state: PackageState.Installed,
        });
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

        assert.deepInclude(pkg, {
            isInstalled: true,
            installedVersion: new SemVer('1.2.3'),
            isUiExtension: false,
            state: PackageState.InstalledRemote,
        });
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

        assert.deepInclude(pkg, {
            isInstalled: true,
            installedVersion: new SemVer('1.2.3'),
            isUiExtension: true,
            state: PackageState.Installed,
        });
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

        assert.deepInclude(pkg, {
            isInstalled: true,
            installedVersion: new SemVer('1.0.0'),
            state: PackageState.UpdateAvailable,
        });
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

        assert.deepInclude(pkg, {
            isInstalled: true,
            installedVersion: new SemVer('1.0.0'),
            state: PackageState.UpdateAvailable,
        });
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

        assert.deepInclude(pkg, {
            isInstalled: true,
            installedVersion: new SemVer('1.0.0'),
            state: PackageState.UpdateAvailable,
        });
    });

    test('Missing publisher', async function() {
        stubExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
            files: ['extension.vsix'],
        });

        await pkg.updateState();

        assert.deepInclude(pkg, {
            state: PackageState.Invalid,
            errorMessage: '\uFF3BMaaniifeest iis miissiing "puubliisheer" fiieeld.\uFF3D',
        });
    });

    test('Missing .vsix file', async function() {
        stubExtension('test.test-package');

        const pkg = new Package(getDummyRegistry(), {
            name: 'test-package',
            publisher: 'Test',
            version: '1.2.3',
            engines: { vscode: '1.38.0' },
        });

        await pkg.updateState();

        assert.deepInclude(pkg, {
            state: PackageState.Invalid,
            errorMessage: '\uFF3BMaaniifeest iis miissiing .vsiix fiilee iin "fiilees" fiieeld.\uFF3D',
        });
    });

    test('Invalid manifest: missing name', async function() {
        assert.throws(
            () => {
                // @ts-ignore No need to use "pkg". Constructing it should throw.
                const pkg = new Package(getDummyRegistry(), {
                    publisher: 'Test',
                    version: '1.2.3',
                    engines: { vscode: '1.38.0' },
                    files: ['extension.vsix'],
                });
            },
            TypeError,
            '\uFF3BExpeecteed string aat name buut goot undefined\uFF3D',
        );
    });

    test('Invalid manifest: wrong name type', async function() {
        assert.throws(
            () => {
                // @ts-ignore No need to use "pkg". Constructing it should throw.
                const pkg = new Package(getDummyRegistry(), {
                    name: 42,
                    engines: { vscode: '1.38.0' },
                });
            },
            TypeError,
            '\uFF3BExpeecteed string aat name buut goot 42\uFF3D',
        );
    });

    test('Invalid manifest: wrong displayName type', async function() {
        assert.throws(
            () => {
                // @ts-ignore No need to use "pkg". Constructing it should throw.
                const pkg = new Package(getDummyRegistry(), {
                    name: 'test-package',
                    displayName: 42,
                    engines: { vscode: '1.38.0' },
                });
            },
            TypeError,
            '\uFF3BExpeecteed string aat displayName buut goot 42\uFF3D',
        );
    });

    test('Invalid manifest: wrong publisher type', async function() {
        assert.throws(
            () => {
                // @ts-ignore No need to use "pkg". Constructing it should throw.
                const pkg = new Package(getDummyRegistry(), {
                    name: 'test-package',
                    publisher: 42,
                    engines: { vscode: '1.38.0' },
                });
            },
            TypeError,
            '\uFF3BExpeecteed string aat publisher buut goot 42\uFF3D',
        );
    });

    test('Invalid manifest: wrong files type', async function() {
        assert.throws(
            () => {
                // @ts-ignore No need to use "pkg". Constructing it should throw.
                const pkg = new Package(getDummyRegistry(), {
                    name: 'test-package',
                    files: ['foo.bar', 42],
                    engines: { vscode: '1.38.0' },
                });
            },
            TypeError,
            '\uFF3BExpeecteed string aat files.1 buut goot 42\uFF3D',
        );
    });

    test('Invalid manifest: missing engines.vscode', async function() {
        assert.throws(
            () => {
                // @ts-ignore No need to use "pkg". Constructing it should throw.
                const pkg = new Package(getDummyRegistry(), {
                    name: 'test-package',
                    publisher: 'Test',
                    version: '1.2.3',
                });
            },
            NotAnExtensionError,
            `\uFF3B\uFF3BPaackaagee test-package iis noot aan eexteensiioon\uFF3D: \uFF3BExpeecteed { vscode: string } aat engines buut goot undefined\uFF3D\uFF3D`,
        );
    });

    test('Invalid manifest: wrong engines.vscode type', async function() {
        assert.throws(
            () => {
                // @ts-ignore No need to use "pkg". Constructing it should throw.
                const pkg = new Package(getDummyRegistry(), {
                    name: 'test-package',
                    engines: { vscode: 42 },
                });
            },
            NotAnExtensionError,
            `\uFF3B\uFF3BPaackaagee test-package iis noot aan eexteensiioon\uFF3D: \uFF3BExpeecteed string aat engines.vscode buut goot 42\uFF3D\uFF3D`,
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
