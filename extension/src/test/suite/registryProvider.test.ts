import { assert, use } from 'chai';
import chaiSubset = require('chai-subset');
import * as chaiSubsetInOrder from 'chai-subset-in-order';
import * as search from 'libnpmsearch';
import { after, afterEach, before, beforeEach } from 'mocha';
import * as nock from 'nock';
import { SemVer } from 'semver';
import sinon = require('sinon');
import 'source-map-support/register';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { ExtensionInfoService } from '../../extensionInfo';
import { Package } from '../../Package';
import { Registry, RegistrySource } from '../../Registry';
import { RegistryProvider } from '../../RegistryProvider';
import { stubGlobalConfiguration } from '../stubs';
import { clearCache, mockSearch, PackageMetadata } from '../util';

use(chaiSubset);
use(chaiSubsetInOrder);

nls.config({ locale: 'pseudo' });

// Test suite should be run inside workspace test-fixtures/fixture1
suite('Registry Provider', function () {
    vscode.window.showInformationMessage(`Start ${this.title} tests`);

    let scope1: nock.Scope;
    let scope2: nock.Scope;
    let extensionInfo: ExtensionInfoService;

    before(function () {
        this.timeout(2000);

        // Mock data for registries in extensions.private.json
        scope1 = nock(WORKSPACE_REGISTRY_URL);
        scope1.persist();

        mockSearch(scope1, '*', Object.values(WORKSPACE_SEARCH));
        mockSearch(scope1, 'keywords:test', [WORKSPACE_SEARCH.test]);

        scope1.get('/test').reply(200, WORKSPACE_PACKAGE.test);
        scope1.get('/recommended1').reply(200, WORKSPACE_PACKAGE.recommended1);
        scope1.get('/recommended2').reply(200, WORKSPACE_PACKAGE.recommended2);
        scope1.get('/invalid').reply(200, WORKSPACE_PACKAGE.invalid);

        // Mock data for registries in user settings
        scope2 = nock(USER_REGISTRY_URL);
        scope2.persist();

        mockSearch(scope2, '*', Object.values(USER_SEARCH));

        scope2.get('/user').reply(200, USER_PACKAGE.user);
    });

    after(function () {
        // Ensure that every mock response defined above was used at least once.
        scope1.done();
        scope2.done();

        nock.cleanAll();
    });

    beforeEach(function () {
        extensionInfo = new ExtensionInfoService();

        // Ensure that cached results from a previous test do not affect the
        // next test.
        clearCache();
    });

    afterEach(function () {
        extensionInfo.dispose();
        sinon.restore();
    });

    test('Get registries', async function () {
        stubGlobalConfiguration('privateExtensions', USER_REGISTRY_CONFIG);

        const provider = new RegistryProvider(extensionInfo);

        const registries = provider.getRegistries();

        // Registries should be in the order they are defined, with workspace
        // registries first and user registries last.
        const expected = [EXPECT_REGISTRY.workspace1, EXPECT_REGISTRY.workspace2, EXPECT_REGISTRY.user];

        assert.containSubsetInOrder(registries, expected);
        assert.lengthOf(registries, expected.length);
    });

    test('Get recommendations', async function () {
        stubGlobalConfiguration('privateExtensions', USER_REGISTRY_CONFIG);

        const provider = new RegistryProvider(extensionInfo);

        const recommendations = provider.getRecommendedExtensions();
        const expected = new Set(['test.recommended1', 'test.recommended2']);

        assert.deepStrictEqual(recommendations, expected);
    });

    test('Get unique packages', async function () {
        stubGlobalConfiguration('privateExtensions', USER_REGISTRY_CONFIG);

        const provider = new RegistryProvider(extensionInfo);

        const packages = await provider.getUniquePackages();
        packages.sort(Package.compare);

        const expected = [
            EXPECT_PACKAGE.recommended1,
            EXPECT_PACKAGE.recommended2,
            EXPECT_PACKAGE.test,
            EXPECT_PACKAGE.user,
        ];

        assert.containSubset(packages, expected);
        assert.lengthOf(packages, expected.length);
    });

    test('Tracking custom channel', async function () {
        stubGlobalConfiguration('privateExtensions', USER_REGISTRY_CONFIG_CHANNEL);

        const provider = new RegistryProvider(extensionInfo);
        const packages = await provider.getUniquePackages();
        packages.sort(Package.compare);

        const expected = [
            EXPECT_PACKAGE.recommended1,
            EXPECT_PACKAGE.recommended2,
            EXPECT_PACKAGE.testInsiders,
            EXPECT_PACKAGE.user,
        ];

        assert.containSubset(packages, expected);
        assert.lengthOf(packages, expected.length);
    });

    test('Invalid user config: wrong type', async function () {
        stubGlobalConfiguration('privateExtensions', {
            registries: 42,
        });

        const provider = new RegistryProvider(extensionInfo);
        const type = 'Array<{ name: string, registry?: string }>';

        assert.throws(
            () => {
                provider.getUserRegistries();
            },
            TypeError,
            `\uFF3B${INVALID_CONFIG_CONTEXT}: \uFF3BExpeecteed ${type} buut goot 42\uFF3D\uFF3D`,
        );
    });

    test('Invalid user config: missing name', async function () {
        stubGlobalConfiguration('privateExtensions', {
            registries: [{ registry: USER_REGISTRY_URL }],
        });

        const provider = new RegistryProvider(extensionInfo);

        assert.throws(
            () => {
                provider.getUserRegistries();
            },
            TypeError,
            `\uFF3B${INVALID_CONFIG_CONTEXT}: \uFF3BExpeecteed string aat 0.name buut goot undefined\uFF3D\uFF3D`,
        );
    });

    test('Invalid user config: wrong name type', async function () {
        stubGlobalConfiguration('privateExtensions', {
            registries: [{ name: 42 }],
        });

        const provider = new RegistryProvider(extensionInfo);

        assert.throws(
            () => {
                provider.getUserRegistries();
            },
            TypeError,
            `\uFF3B${INVALID_CONFIG_CONTEXT}: \uFF3BExpeecteed string aat 0.name buut goot 42\uFF3D\uFF3D`,
        );
    });

    test('Invalid user config: wrong registry type', async function () {
        stubGlobalConfiguration('privateExtensions', {
            registries: [{ name: 'User Registry', registry: 42 }],
        });

        const provider = new RegistryProvider(extensionInfo);

        assert.throws(
            () => {
                provider.getUserRegistries();
            },
            TypeError,
            `\uFF3B${INVALID_CONFIG_CONTEXT}: \uFF3BExpeecteed string aat 0.registry buut goot 42\uFF3D\uFF3D`,
        );
    });

    test('Invalid user config: mixed values', async function () {
        stubGlobalConfiguration('privateExtensions', {
            registries: [
                { name: 'User Registry 1', registry: USER_REGISTRY_URL },
                { name: 42, registry: WORKSPACE_REGISTRY_URL },
            ],
        });

        const provider = new RegistryProvider(extensionInfo);

        assert.throws(
            () => {
                provider.getUserRegistries();
            },
            TypeError,
            `\uFF3B${INVALID_CONFIG_CONTEXT}: \uFF3BExpeecteed string aat 1.name buut goot 42\uFF3D\uFF3D`,
        );
    });
});

const INVALID_CONFIG_CONTEXT = '\uFF3BpriivaateeExteensiioons.reegiistriiees seettiing iis iinvaaliid\uFF3D';

const WORKSPACE_REGISTRY_URL = 'https://workspace.registry';
const USER_REGISTRY_URL = 'https://user.registry';

const USER_REGISTRY_CONFIG = {
    registries: [
        {
            name: 'User Registry',
            registry: USER_REGISTRY_URL,
        },
    ],
};

const USER_REGISTRY_CONFIG_CHANNEL = {
    registries: [
        {
            name: 'User Registry',
            registry: USER_REGISTRY_URL,
        },
    ],
    channels: {
        'test.test': 'insiders',
    },
};

const WORKSPACE_SEARCH: Record<string, search.Result> = {
    test: {
        name: 'test',
        version: '1.0.0',
        keywords: ['test'],
    },
    recommended1: {
        name: 'recommended1',
        version: '1.0.0',
    },
    recommended2: {
        name: 'recommended2',
        version: '1.0.0',
    },
    invalid: {
        name: 'invalid',
        version: '1.0.0',
    },
};

const USER_SEARCH: Record<string, search.Result> = {
    user: {
        name: 'user',
        version: '1.0.0',
    },
};

const WORKSPACE_PACKAGE: Record<string, PackageMetadata> = {
    test: {
        name: 'test',
        'dist-tags': { latest: '1.0.0', insiders: '2.0.0-beta.0' },
        versions: {
            '1.0.0': {
                publisher: 'Test',
                name: 'test',
                version: '1.0.0',
                engines: { vscode: '1.38.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: WORKSPACE_REGISTRY_URL + 'test/-/test-1.0.0.tgz',
                },
                files: ['extension.vsix'],
            },
            '2.0.0-beta.0': {
                publisher: 'Test',
                name: 'test',
                version: '2.0.0-beta.0',
                engines: { vscode: '1.38.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: WORKSPACE_REGISTRY_URL + 'test/-/test-2.0.0-beta.0.tgz',
                },
                files: ['extension.vsix'],
            },
        },
    },
    recommended1: {
        name: 'recommended1',
        'dist-tags': { latest: '1.0.0' },
        versions: {
            '1.0.0': {
                publisher: 'Test',
                name: 'recommended1',
                version: '1.0.0',
                engines: { vscode: '1.38.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: WORKSPACE_REGISTRY_URL + 'recommended1/-/recommended1-1.0.0.tgz',
                },
                files: ['extension.vsix'],
            },
        },
    },
    recommended2: {
        name: 'recommended2',
        'dist-tags': { latest: '1.0.0' },
        versions: {
            '1.0.0': {
                publisher: 'Test',
                name: 'recommended2',
                version: '1.0.0',
                engines: { vscode: '1.38.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: WORKSPACE_REGISTRY_URL + 'recommended2/-/recommended2-1.0.0.tgz',
                },
                files: ['extension.vsix'],
            },
        },
    },
    invalid: {
        name: 'invalid',
        'dist-tags': { latest: '1.0.0' },
        versions: {
            '1.0.0': {
                name: 'invalid',
                version: '1.0.0',
                dist: {
                    shasum: 'TODO',
                    tarball: WORKSPACE_REGISTRY_URL + 'invalid/-/invalid-1.0.0.tgz',
                },
            },
        },
    },
};

const USER_PACKAGE: Record<string, PackageMetadata> = {
    user: {
        name: 'user',
        'dist-tags': { latest: '1.0.0' },
        versions: {
            '1.0.0': {
                publisher: 'Test',
                name: 'user',
                version: '1.0.0',
                engines: { vscode: '1.38.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: USER_REGISTRY_URL + 'user/-/user-1.0.0.tgz',
                },
                files: ['extension.vsix'],
            },
        },
    },
};

const EXPECT_PACKAGE: Record<string, Partial<Package>> = {
    test: {
        extensionId: 'test.test',
        version: new SemVer('1.0.0'),
    },
    testInsiders: {
        extensionId: 'test.test',
        version: new SemVer('2.0.0-beta.0'),
    },
    recommended1: {
        extensionId: 'test.recommended1',
    },
    recommended2: {
        extensionId: 'test.recommended2',
    },
    user: {
        extensionId: 'test.user',
    },
};

const EXPECT_REGISTRY: Record<string, Partial<Registry>> = {
    workspace1: {
        name: 'Workspace Registry 1',
        uri: vscode.Uri.parse(WORKSPACE_REGISTRY_URL),
        source: RegistrySource.Workspace,
        query: '*',
    },
    workspace2: {
        name: 'Workspace Registry 2',
        uri: vscode.Uri.parse(WORKSPACE_REGISTRY_URL),
        source: RegistrySource.Workspace,
        query: 'keywords:test',
    },
    user: {
        name: 'User Registry',
        uri: vscode.Uri.parse(USER_REGISTRY_URL),
        source: RegistrySource.User,
        query: '*',
    },
};
