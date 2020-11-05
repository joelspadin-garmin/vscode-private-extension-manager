import { assert } from 'chai';
import { afterEach, beforeEach } from 'mocha';
import sinon = require('sinon');
import 'source-map-support/register';
import * as vscode from 'vscode';

import { ExtensionInfoService } from '../../extensionInfo';
import { stubRemoteName, CommonStubs } from '../stubs';

suite('Extension Info', function () {
    vscode.window.showInformationMessage(`Start ${this.title} tests`);

    let stubs: CommonStubs;
    let extensionInfo: ExtensionInfoService;

    beforeEach(function () {
        stubs = new CommonStubs();
        extensionInfo = new ExtensionInfoService();
    });

    afterEach(function () {
        extensionInfo.dispose();
        stubs.dispose();
        sinon.restore();
    });

    test('Get extension: workspace', async function () {
        stubs.stubExtension('test.foo', {});
        stubs.stubExtension('test.bar', {});
        stubs.stubExtension('test.baz', undefined);

        const foo = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo);
        assert.strictEqual(foo?.id, 'test.foo');

        const bar = await extensionInfo.getExtension('test.bar');
        assert.isDefined(bar);
        assert.strictEqual(bar?.id, 'test.bar');

        const baz = await extensionInfo.getExtension('test.baz');
        assert.isUndefined(baz);
    });

    test('Get extension: local', async function () {
        stubRemoteName('test-remote');
        stubs.stubLocalExtension('test.foo', {});
        stubs.stubLocalExtension('test.bar', {});

        const foo = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo);
        assert.strictEqual(foo?.id, 'test.foo');

        const bar = await extensionInfo.getExtension('test.bar');
        assert.isDefined(bar);
        assert.strictEqual(bar?.id, 'test.bar');
    });

    test('Get extension: mixed', async function () {
        stubRemoteName('test-remote');
        stubs.stubExtension('test.foo', {});
        stubs.stubLocalExtension('test.bar', {});

        const foo = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo);
        assert.strictEqual(foo?.id, 'test.foo');

        const bar = await extensionInfo.getExtension('test.bar');
        assert.isDefined(bar);
        assert.strictEqual(bar?.id, 'test.bar');
    });

    test('Extensions changed: workspace', async function () {
        stubs.stubExtension('test.foo', {
            packageJSON: {
                version: '1.0.0',
            },
        });

        const foo1 = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo1);
        assert.strictEqual(foo1?.id, 'test.foo');
        assert.strictEqual(foo1?.version.format(), '1.0.0');

        stubs.stubExtension('test.foo', {
            packageJSON: {
                version: '2.0.0',
            },
        });

        stubs.onDidChangeMyExtension.fire();

        const foo2 = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo2);
        assert.strictEqual(foo2?.id, 'test.foo');
        assert.strictEqual(foo2?.version.format(), '2.0.0');
    });

    test('Extensions changed: local', async function () {
        stubRemoteName('test-remote');
        stubs.stubLocalExtension('test.foo', {
            packageJSON: {
                version: '1.0.0',
            },
        });

        const foo1 = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo1);
        assert.strictEqual(foo1?.id, 'test.foo');
        assert.strictEqual(foo1?.version.format(), '1.0.0');

        stubs.stubLocalExtension('test.foo', {
            packageJSON: {
                version: '2.0.0',
            },
        });

        stubs.onDidChangeOtherExtension.fire();

        const foo2 = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo2);
        assert.strictEqual(foo2?.id, 'test.foo');
        assert.strictEqual(foo2?.version.format(), '2.0.0');
    });

    test('Wrap extension change', async function () {
        stubs.stubExtension('test.foo', {
            packageJSON: {
                version: '1.0.0',
            },
        });

        const foo1 = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo1);
        assert.strictEqual(foo1?.id, 'test.foo');
        assert.strictEqual(foo1?.version.format(), '1.0.0');

        await extensionInfo.waitForExtensionChange(
            delay(() => {
                stubs.stubExtension('test.foo', {
                    packageJSON: {
                        version: '2.0.0',
                    },
                });
                stubs.onDidChangeMyExtension.fire();
            }),
        );

        const foo2 = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo2);
        assert.strictEqual(foo2?.id, 'test.foo');
        assert.strictEqual(foo2?.version.format(), '2.0.0');
    });

    test('Wrap extension change: timeout', async function () {
        stubs.stubExtension('test.foo', {
            packageJSON: {
                version: '1.0.0',
            },
        });

        const foo1 = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo1);
        assert.strictEqual(foo1?.id, 'test.foo');
        assert.strictEqual(foo1?.version.format(), '1.0.0');

        // Wait for a change that will never occur. This should continue
        // normally after the timeout expires.
        await extensionInfo.waitForExtensionChange(Promise.resolve(), 100);

        const foo2 = await extensionInfo.getExtension('test.foo');
        assert.isDefined(foo2);
        assert.strictEqual(foo2?.id, 'test.foo');
        assert.strictEqual(foo2?.version.format(), '1.0.0');
    });
});

function delay(callback: () => void, timeout = 100) {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            callback();
            resolve();
        }, timeout);
    });
}
