import * as path from 'path';
import sinon = require('sinon');
import * as vscode from 'vscode';

import { ExtensionInfoService } from '../extensionInfo';

const DEFAULT_PACKAGE_JSON = {
    version: '1.0.0',
};

/**
 * Holds stubs that are common to most tests and may need to be changed multiple
 * times though a test.
 */
export class CommonStubs implements vscode.Disposable {
    public getExtensionStub: sinon.SinonStub<[string], vscode.Extension<unknown> | undefined>;
    public executeCommandStub: sinon.SinonStub<[string, ...any[]], Thenable<unknown>>;

    public onDidChangeMyExtension = new vscode.EventEmitter<void>();
    public onDidChangeOtherExtension = new vscode.EventEmitter<void>();

    private disposable: vscode.Disposable;

    constructor() {
        this.getExtensionStub = sinon.stub(vscode.extensions, 'getExtension');
        this.executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');

        // Replace event emitters for extension change events with our own that
        // we can fire from a test.
        sinon.stub(vscode.extensions, 'onDidChange').get(() => this.onDidChangeMyExtension.event);
        sinon
            .stub(ExtensionInfoService.prototype, 'onDidChangeOtherExtension')
            .get(() => this.onDidChangeOtherExtension.event);

        this.disposable = vscode.Disposable.from(this.onDidChangeMyExtension, this.onDidChangeOtherExtension);
    }

    public dispose(): void {
        this.disposable.dispose();
    }

    /**
     * Stubs `vscode.extension.getExtension()` for a given extension ID so it
     * returns values from the given mock data object.
     * @param extensionId The extension to stub.
     * @param mockData The extension data to return. If `undefined`, the stub will
     *      return `undefined`, indicating that the extension is not installed.
     *      Use `{}` if an extension should appear to be installed, but the
     *      extension details don't matter.
     */
    public stubExtension<T>(extensionId: string, mockData?: Partial<vscode.Extension<T>>): void {
        let result: vscode.Extension<any> | undefined;

        if (mockData) {
            const extensionPath = path.resolve('.', 'tmp', extensionId);
            result = {
                id: extensionId,
                extensionPath,
                extensionUri: vscode.Uri.file(extensionPath),
                isActive: false,
                packageJSON: DEFAULT_PACKAGE_JSON,
                extensionKind: vscode.env.remoteName ? vscode.ExtensionKind.Workspace : vscode.ExtensionKind.UI,
                exports: {},
                activate: () => Promise.resolve(mockData.exports ?? {}),
                ...mockData,
            };
        }

        this.getExtensionStub.withArgs(extensionId).returns(result);
    }

    /**
     * Stubs `vscode.extension.getExtension()` for a given extension ID so it
     * returns that the extension is not installed on the remote machine (where the
     * extension manager runs), then stubs the
     * `_privateExtensionManager.remoteHelper.getExtension` command so it returns
     * data from the given mock data object.
     *
     * You must also use `stubRemoteName()` so the extension appears to be
     * running in a remote workspace.
     * @param extensionId The extension to stub.
     * @param mockData The extension data to return. If `undefined`, the stub will
     *      return `undefined`, indicating that the extension is not installed locally.
     *      Use `{}` if an extension should appear to be installed, but the
     *      extension details don't matter.
     */
    public stubLocalExtension(extensionId: string, mockData?: Partial<vscode.Extension<any>>): void {
        let result: Partial<vscode.Extension<any>> | undefined;

        if (mockData) {
            result = {
                id: extensionId,
                packageJSON: DEFAULT_PACKAGE_JSON,
                extensionKind: vscode.ExtensionKind.UI,
                ...mockData,
            };
        }

        this.getExtensionStub.withArgs(extensionId).returns(undefined);

        this.executeCommandStub
            .withArgs('_privateExtensionManager.remoteHelper.getExtension', extensionId)
            .resolves(result);
    }
}

/**
 * Stubs `vscode.env.remoteName` to return the given string.
 */
export function stubRemoteName(name?: string): sinon.SinonStub {
    return sinon.stub(vscode.env, 'remoteName').get(() => name);
}

/**
 * Stubs `vscode.workspace.getConfiguration()` for a given section so it returns
 * values from the given mock data object.
 *
 * This does not support resource-scoped configuration. All values are treated
 * as global configuration.
 *
 * It also does not attempt to correctly handle dot-separated sections.
 * If you want to stub `foo.bar.baz = 42`, use
 * `stubGlobalConfiguration('foo', { 'bar.baz': 42 })`. If this object
 * should be accessible using `vscode.workspace.getConfiguration('foo.bar')` as
 * well, then you must stub `foo.bar` separately.
 * @param section The section to stub. Omit to stub `vscode.workspace.getConfiguration()`.
 * @param mockData The configuration data to return.
 */
export function stubGlobalConfiguration(mockData: Record<string, any>): void;
export function stubGlobalConfiguration(section: string, mockData: Record<string, any>): void;
export function stubGlobalConfiguration(section: string | Record<string, any>, mockData?: Record<string, any>): void {
    const stub = sinon.stub(vscode.workspace, 'getConfiguration');

    if (typeof section === 'string') {
        stub.withArgs(section);
    } else {
        stub.withArgs();
        mockData = section;
    }

    if (typeof mockData !== 'object') {
        throw new TypeError();
    }

    stub.returns(new StubConfiguration(mockData));
}

interface InspectResult<T> {
    key: string;
    defaultValue?: T;
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
}

class StubConfiguration implements vscode.WorkspaceConfiguration {
    readonly [key: string]: any;

    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
    get(section: any, defaultValue?: any) {
        return this.mockData[section] ?? defaultValue;
    }

    has(section: string): boolean {
        return section in this.mockData;
    }

    inspect<T>(section: string): InspectResult<T> | undefined {
        if (this.has(section)) {
            return {
                key: section,
                globalValue: this.get(section),
            };
        } else {
            return undefined;
        }
    }

    update(
        section: string,
        value: any,
        _configurationTarget?: boolean | vscode.ConfigurationTarget,
        _overrideInLanguage?: boolean,
    ): Thenable<void> {
        this.mockData[section] = value;
        return Promise.resolve();
    }

    constructor(private mockData: Record<string, any>) {}
}
