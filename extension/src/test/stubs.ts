import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

/**
 * Stubs `vscode.extension.getExtension()` for a given extension ID so it
 * returns values from the given mock data object.
 * @param extensionId The extension to stub.
 * @param mockData The extension data to return. If `undefined`, the stub will
 *      return `undefined`, indicating that the extension is not installed.
 */
export function stubExtension<T>(extensionId: string, mockData?: Partial<vscode.Extension<T>>) {
    let result: vscode.Extension<any> | undefined;

    if (mockData) {
        result = {
            id: extensionId,
            extensionPath: path.resolve('.', 'tmp', extensionId),
            isActive: false,
            packageJSON: {},
            extensionKind: vscode.env.remoteName ? vscode.ExtensionKind.Workspace : vscode.ExtensionKind.UI,
            exports: {},
            activate: () => Promise.resolve(mockData.exports || {}),
            ...mockData,
        };
    }

    return sinon
        .stub(vscode.extensions, 'getExtension')
        .withArgs(extensionId)
        .returns(result);
}

/**
 * Stubs `vscode.extension.getExtension()` for a given extension ID so it
 * returns that the extension is not installed on the remote machine (where the
 * extension manager runs), then stubs the
 * `_privateExtensionManager.remoteHelper.getExtension` command so it returns
 * data from the given mock data object.
 * @param extensionId The extension to stub.
 * @param mockData The extension data to return. If `undefined`, the stub will
 *      return `undefined`, indicating that the extension is not installed locally.
 */
export function stubLocalExtension(extensionId: string, mockData?: Partial<vscode.Extension<any>>) {
    let result: Partial<vscode.Extension<any>> | undefined;

    if (mockData) {
        result = {
            id: extensionId,
            packageJSON: {},
            extensionKind: vscode.ExtensionKind.UI,
            ...mockData,
        };
    }

    sinon
        .stub(vscode.extensions, 'getExtension')
        .withArgs(extensionId)
        .returns(undefined);

    return sinon
        .stub(vscode.commands, 'executeCommand')
        .withArgs('_privateExtensionManager.remoteHelper.getExtension', extensionId)
        .resolves(result);
}

/**
 * Stubs `vscode.env.remoteName` to return the given string.
 */
export function stubRemoteName(name?: string) {
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
        return this.mockData[section] || defaultValue;
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
        _configurationTarget?: boolean | vscode.ConfigurationTarget | undefined,
    ): Thenable<void> {
        this.mockData[section] = value;
        return Promise.resolve();
    }

    constructor(private mockData: Record<string, any>) {}
}
