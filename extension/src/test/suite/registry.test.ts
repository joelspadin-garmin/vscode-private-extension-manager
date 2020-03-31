import { assert, use } from 'chai';
import chaiSubset = require('chai-subset');
import * as search from 'libnpmsearch';
import { after, afterEach, before, beforeEach } from 'mocha';
import * as nock from 'nock';
import { SemVer } from 'semver';
import 'source-map-support/register';
import * as vscode from 'vscode';
import { Uri } from 'vscode';

import { ExtensionInfoService } from '../../extensionInfo';
import { Package } from '../../Package';
import { Registry, RegistrySource } from '../../Registry';
import { LATEST } from '../../releaseChannel';
import { clearCache, mockSearch, PackageMetadata } from '../util';

use(chaiSubset);

suite('Registry Package Search', function () {
    vscode.window.showInformationMessage(`Start ${this.title} tests`);

    let scope: nock.Scope;
    let extensionInfo: ExtensionInfoService;

    before(function () {
        // Tests should complete quickly since we're mocking all network
        // requests. If any test takes more than a couple seconds, it probably
        // isn't going to complete at all.
        this.timeout(2000);

        scope = nock(REGISTRY_URL);

        // Since a package search involves several requests, and many of the
        // requests for package information are the same regardless of which
        // search is run, simplify setup by defining all mock responses in once
        // place and persisting them so they can be used more than once.
        scope.persist();

        mockSearch(scope, '*', Object.values(SEARCH));
        mockSearch(scope, 'keywords:foo', [SEARCH.foo]);
        mockSearch(scope, 'keywords:bar', [SEARCH.bar, SEARCH.invalid]);
        mockSearch(scope, 'keywords:b-packages', [SEARCH.bar, SEARCH.baz]);
        mockSearch(scope, 'keywords:foo keywords:bar', [SEARCH.foo, SEARCH.bar, SEARCH.invalid]);

        scope.get('/foo').reply(200, PACKAGE.foo);
        scope.get('/bar').reply(200, PACKAGE.bar);
        scope.get('/baz').reply(200, PACKAGE.baz);
        scope.get('/invalid').reply(200, PACKAGE.invalid);

        // TODO: add mock tarball responses and test package downloads.
    });

    after(function () {
        // Ensure that every mock response defined above was used at least once.
        scope.done();

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
    });

    test('Create registry', async function () {
        const registry = new Registry(extensionInfo, 'test', RegistrySource.Workspace, {
            registry: REGISTRY_URL,
            query: 'query',
            otp: 123456,
        });

        assert.deepNestedInclude(registry, {
            name: 'test',
            source: RegistrySource.Workspace,
            query: 'query',
            'options.otp': 123456,
            uri: Uri.parse(REGISTRY_URL),
        });
    });

    test('Get all packages', async function () {
        const registry = new Registry(extensionInfo, 'test', RegistrySource.User, {
            registry: REGISTRY_URL,
        });

        const results = await registry.getPackages();
        const expected = [EXPECT.foo, EXPECT.bar, EXPECT.baz];

        assert.containSubset(results, expected);
        assert.lengthOf(results, expected.length);
    });

    test('Get keyword 1', async function () {
        const registry = new Registry(extensionInfo, 'test', RegistrySource.User, {
            registry: REGISTRY_URL,
            query: 'keywords:foo',
        });

        const results = await registry.getPackages();
        const expected = [EXPECT.foo];

        assert.containSubset(results, expected);
        assert.lengthOf(results, expected.length);
    });

    test('Get keyword 2', async function () {
        const registry = new Registry(extensionInfo, 'test', RegistrySource.User, {
            registry: REGISTRY_URL,
            query: 'keywords:bar',
        });

        const results = await registry.getPackages();
        const expected = [EXPECT.bar];

        assert.containSubset(results, expected);
        assert.lengthOf(results, expected.length);
    });

    test('Get keyword 3', async function () {
        const registry = new Registry(extensionInfo, 'test', RegistrySource.User, {
            registry: REGISTRY_URL,
            query: 'keywords:b-packages',
        });

        const results = await registry.getPackages();
        const expected = [EXPECT.bar, EXPECT.baz];

        assert.containSubset(results, expected);
        assert.lengthOf(results, expected.length);
    });

    test('Get two keywords with string', async function () {
        const registry = new Registry(extensionInfo, 'test', RegistrySource.User, {
            registry: REGISTRY_URL,
            query: 'keywords:foo keywords:bar',
        });

        const results = await registry.getPackages();
        const expected = [EXPECT.foo, EXPECT.bar];

        assert.containSubset(results, expected);
        assert.lengthOf(results, expected.length);
    });

    test('Get two keywords with array', async function () {
        // query = ['term1', 'term2'] should be identical to 'term1 term2'.
        const registry = new Registry(extensionInfo, 'test', RegistrySource.User, {
            registry: REGISTRY_URL,
            query: ['keywords:foo', 'keywords:bar'],
        });

        const results = await registry.getPackages();
        const expected = [EXPECT.foo, EXPECT.bar];

        assert.containSubset(results, expected);
        assert.lengthOf(results, expected.length);
    });

    test('Get package metadata', async function () {
        const registry = new Registry(extensionInfo, 'test', RegistrySource.User, {
            registry: REGISTRY_URL,
        });

        const latest = await registry.getPackage('baz', LATEST);
        assert.deepInclude(latest, EXPECT.baz);

        const versionOne = await registry.getPackage('baz', '1.0.0');
        assert.deepInclude(versionOne, EXPECT.bazOld);

        const versionTwo = await registry.getPackage('baz', '2.0.0');
        assert.deepInclude(versionTwo, EXPECT.baz);
    });
});

/**
 * URL of the mock registry.
 */
const REGISTRY_URL = 'https://test.registry';

/**
 * Mock search results for each package.
 */
const SEARCH: Record<string, search.Result> = {
    foo: {
        name: 'foo',
        version: '1.2.3',
        description: 'foo package',
        keywords: ['foo'],
    },
    bar: {
        name: 'bar',
        version: '1.0.0',
        description: 'bar package',
        keywords: ['bar', 'b-packages'],
    },
    baz: {
        name: 'baz',
        version: '2.0.0',
        description: 'baz package',
        keywords: ['baz', 'b-packages'],
    },
    // This package should be discarded when getting packages from a registry.
    invalid: {
        name: 'invalid',
        version: '1.0.0',
        description: 'This is not a vscode extension',
        keywords: ['bar'],
    },
};

/**
 * Mock package metadata.
 */
const PACKAGE: Record<string, PackageMetadata> = {
    foo: {
        name: 'foo',
        description: 'foo package',
        'dist-tags': { latest: '1.2.3' },
        versions: {
            '1.0.0': {
                publisher: 'Test',
                name: 'foo',
                description: 'old foo package',
                version: '1.0.0',
                engines: { vscode: '1.35.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: REGISTRY_URL + '/foo/-/foo-1.0.0.tgz',
                },
                files: ['extension.vsix'],
            },
            '1.2.3': {
                publisher: 'Test',
                name: 'foo',
                description: 'foo package',
                version: '1.2.3',
                engines: { vscode: '1.38.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: REGISTRY_URL + '/foo/-/foo-1.2.3.tgz',
                },
                files: ['media/icon.svg', 'extension.vsix'],
            },
        },
    },
    bar: {
        name: 'bar',
        description: 'bar package',
        'dist-tags': { latest: '1.0.0' },
        versions: {
            '1.0.0': {
                publisher: 'Test',
                name: 'bar',
                description: 'bar package',
                version: '1.0.0',
                engines: { vscode: '1.38.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: REGISTRY_URL + '/bar/-/bar-1.0.0.tgz',
                },
                files: ['extension.vsix'],
            },
        },
    },
    baz: {
        name: 'baz',
        description: 'baz package',
        'dist-tags': { latest: '2.0.0' },
        versions: {
            '1.0.0': {
                publisher: 'Test',
                name: 'baz',
                description: 'old baz package',
                version: '1.0.0',
                engines: { vscode: '1.25.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: REGISTRY_URL + '/baz/-/baz-1.0.0.tgz',
                },
                files: ['extension.vsix'],
            },
            '2.0.0': {
                publisher: 'Test',
                name: 'baz',
                displayName: 'Baz Extension',
                description: 'baz package',
                version: '2.0.0',
                engines: { vscode: '1.38.0' },
                dist: {
                    shasum: 'TODO',
                    tarball: REGISTRY_URL + '/baz/-/baz-2.0.0.tgz',
                },
                files: ['extension.vsix'],
            },
        },
    },
    invalid: {
        name: 'invalid',
        description: 'This is not a vscode extension',
        'dist-tags': { latest: '1.0.0' },
        versions: {
            '1.0.0': {
                name: 'invalid',
                description: 'This is not a vscode extension',
                version: '1.0.0',
                dist: {
                    shasum: 'TODO',
                    tarball: REGISTRY_URL + '/invalid/-/invalid-1.0.0.tgz',
                },
            },
        },
    },
};

/**
 * Key/values to expect in `Package` objects.
 */
const EXPECT: Record<string, Partial<Package>> = {
    foo: {
        name: 'foo',
        displayName: 'foo',
        extensionId: 'test.foo',
        description: 'foo package',
        version: new SemVer('1.2.3'),
    },
    bar: {
        name: 'bar',
        displayName: 'bar',
        extensionId: 'test.bar',
        description: 'bar package',
        version: new SemVer('1.0.0'),
    },
    baz: {
        name: 'baz',
        displayName: 'Baz Extension',
        extensionId: 'test.baz',
        description: 'baz package',
        version: new SemVer('2.0.0'),
    },
    bazOld: {
        name: 'baz',
        displayName: 'baz',
        extensionId: 'test.baz',
        description: 'old baz package',
        version: new SemVer('1.0.0'),
    },
};
