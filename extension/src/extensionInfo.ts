import * as semver from 'semver';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { context } from './context';
import { getLogger } from './logger';
import { Package } from './Package';

const localize = nls.loadMessageBundle();

/**
 * The data from `vscode.Extension` that is needed for managing extensions.
 */
export interface ExtensionInfo {
    /**
     * The canonical extension identifier in the form of: `publisher.name`.
     */
    id: string;

    /**
     * The extension kind describes if an extension runs where the UI runs or if
     * an extension runs where the remote extension host runs. The extension
     * kind if defined in the `package.json` file of extensions but can also be
     * refined via the the `remote.extensionKind`-setting. When no remote
     * extension host exists, the value is `vscode.ExtensionKind.UI`.
     */
    extensionKind: vscode.ExtensionKind;

    /**
     * The version number of the extension as defined in its `package.json` file.
     */
    version: semver.SemVer;
}

/**
 * If an extension takes longer than this to install/uninstall, assume VS Code
 * needs to be reloaded for it to take effect.
 */
const EXTENSION_CHANGE_TIMEOUT_MS = 2000;

/**
 * Extension info returned by the remote helper extension.
 */
interface RemoteHelperExtensionInfo {
    id: string;
    extensionKind: vscode.ExtensionKind;
    packageJSON: any;
}

export class ExtensionInfoService implements vscode.Disposable {
    private static readonly _onDidChangeOtherExtension = new vscode.EventEmitter<void>();

    // Commands can only be registered once, so map the command to an event that
    // each new ExtensionInfoService instance can listen to.
    private static _commandRegistered = false;
    private static registerCommand() {
        if (this._commandRegistered) {
            return;
        }

        try {
            context.subscriptions.push(
                vscode.commands.registerCommand('_privateExtensionManager.notifyExtensionsChanged', () =>
                    this._onDidChangeOtherExtension.fire(),
                ),
            );

            this._commandRegistered = true;
        } catch (ex) {
            // This is normal during tests. The tests and any installed instance of
            // the extension will both try to register the command. Tests stub the
            // event emitter directly and do not use the command.
            getLogger().log(
                localize(
                    'warn.register.fail',
                    'Warning: Failed to register remote extension listener:\n{0}',
                    ex.toString(),
                ),
            );
        }
    }

    private _onDidChange = new vscode.EventEmitter<void>();

    /**
     * An event which fires when any extension on the local or remote machine
     * changes. This can happen when extensions are installed, uninstalled, enabled
     * or disabled.
     */
    public readonly onDidChange = this._onDidChange.event;

    /**
     * An event which fires when any extension on the other machine changes when
     * in a remote workspace.
     *
     * For testing use only. Use onDidChange instead.
     */
    public get onDidChangeOtherExtension(): vscode.Event<void> {
        return ExtensionInfoService._onDidChangeOtherExtension.event;
    }

    /**
     * Cache the info for each extension (keyed by extension ID) so we don't have to
     * repeatedly message the remote helper extension and/or parse the version
     * string if extensions haven't changed.
     *
     * Note that the entry for an extension ID can be `undefined`, which indicates
     * that we have looked up the extension and it wasn't installed.
     */
    private readonly extensionCache: Record<string, ExtensionInfo | undefined> = {};

    private disposable: vscode.Disposable;

    private get myExtensionKind() {
        return vscode.env.remoteName ? vscode.ExtensionKind.Workspace : vscode.ExtensionKind.UI;
    }

    constructor() {
        ExtensionInfoService.registerCommand();

        this.disposable = vscode.Disposable.from(
            this._onDidChange,
            vscode.extensions.onDidChange(this.onMyExtensionChanged, this),
            this.onDidChangeOtherExtension(this.onOtherExtensionChanged, this),
        );
    }

    public dispose(): void {
        this.disposable.dispose();
    }

    /**
     * Clears the extension information cache, forcing subsequent calls to
     * `getExtension()` to query information for all extensions again.
     */
    public clearCache(): void {
        this.clearCacheIf(() => true);
    }

    /**
     * Get an extension by its full identifier in the form `publisher.name`.
     *
     * Unlike `vscode.extensions.getExtension()`, this can provide info for
     * extensions on both the local and remote machines, but it provides a limited
     * subset of the extension information.
     */
    public async getExtension(extensionId: string): Promise<ExtensionInfo | undefined> {
        // Extension IDs are case insensitive. Normalize the case for the key so our
        // cache dictionary is also case insensitive.
        const key = extensionId.toLowerCase();

        // We store undefined in the cache for an extension that is not installed,
        // so check for the presence of the key to differentiate between not
        // installed and no data cached for the extension.
        if (Object.prototype.hasOwnProperty.call(this.extensionCache, key)) {
            return this.extensionCache[key];
        }

        const result = await this.getExtensionNoCache(extensionId);
        this.extensionCache[key] = result;

        return result;
    }

    /**
     * When installing or uninstalling an extension, the changes are not immediately
     * reflected in the extensions API, nor do the commands to install/uninstall an
     * extension report whether vscode needs to be loaded for the changes to take
     * effect.
     *
     * This waits for `task` to complete and either:
     * 1. `vscode.extensions.onDidChange()` fires.
     * 2. `timeout` milliseconds elapse.
     *
     * Use this to wrap a task that installs or uninstalls extensions. Once it
     * returns, either the changes should have taken effect or they weren't going to
     * take effect. You should query the extensions API to see if the changes you
     * expect have been made, and if not, prompt the user to reload the window.
     *
     * @returns The result of `task`.
     */
    public async waitForExtensionChange<T>(
        task: Promise<T>,
        timeout: number = EXTENSION_CHANGE_TIMEOUT_MS,
    ): Promise<T> {
        const wait = new Promise<void>((resolve) => {
            function finished() {
                global.clearTimeout(handle);
                event.dispose();
                resolve();
            }

            const handle = global.setTimeout(finished, timeout);
            const event = this.onDidChange(finished);
        });

        const [result] = await Promise.all([task, wait]);

        return result;
    }

    /**
     * Gets whether the currently-installed version of the extension is newer than
     * the version of the given package.
     */
    public async didExtensionUpdate(pkg: Package): Promise<boolean> {
        const extension = await this.getExtension(pkg.extensionId);
        if (!extension) {
            getLogger().log(
                localize('error.extension.missing', 'Error: Extension {0} missing after update', pkg.extensionId),
            );
            return false;
        }

        return extension.version > pkg.version;
    }

    /**
     * Removes entries from the extension cache that match a predicate function.
     */
    private clearCacheIf(predicate: (extension: ExtensionInfo | undefined) => boolean) {
        for (const key in this.extensionCache) {
            if (Object.prototype.hasOwnProperty.call(this.extensionCache, key)) {
                if (predicate(this.extensionCache[key])) {
                    delete this.extensionCache[key];
                }
            }
        }
    }

    private async getExtensionNoCache(extensionId: string): Promise<ExtensionInfo | undefined> {
        // Check for an extension on this machine.
        const extension = vscode.extensions.getExtension(extensionId);
        if (extension) {
            return toExtensionInfo(extension);
        }

        // If a remote is active, check for the extension on the other machine.
        if (vscode.env.remoteName) {
            try {
                const uiExtension = await vscode.commands.executeCommand<RemoteHelperExtensionInfo>(
                    '_privateExtensionManager.remoteHelper.getExtension',
                    extensionId,
                );

                return uiExtension ? toExtensionInfo(uiExtension) : undefined;
            } catch (ex) {
                getLogger().log(
                    localize('warn.remote.helper.fail', 'Failed to call remote helper:\n{0}', ex.toString()),
                );
            }
        }

        return undefined;
    }

    /**
     * Invalidates cached info for extensions on the same machine as the extension
     * manager, and clears any extensions that are cached as being not installed.
     *
     * This should run whenever `vscode.extensions.onDidChange` event fires so that
     * `getExtensions()` returns up-to-date info for updated, installed, or
     * uninstalled extensions.
     */
    private onMyExtensionChanged() {
        this.clearCacheIf((cache) => cache === undefined || cache.extensionKind === this.myExtensionKind);

        this._onDidChange.fire();
    }

    /**
     * Invalidates cached info for extensions on the other machine, and clears any
     * extensions that are cached as being not installed.
     *
     * This should run whenever the remote helper extension indicates that its
     * `vscode.extensions.onDidChange` event fired, so that `getExtensions()`
     * returns up-to-date info for updated, installed, or uninstalled extensions.
     */
    private onOtherExtensionChanged() {
        this.clearCacheIf((cache) => cache === undefined || cache.extensionKind !== this.myExtensionKind);

        this._onDidChange.fire();
    }
}

function toExtensionInfo(extension: vscode.Extension<any> | RemoteHelperExtensionInfo): ExtensionInfo {
    if (typeof extension.packageJSON.version !== 'string') {
        throw new TypeError(
            localize('package.missing.version', 'Package for extension {0} is missing version', extension.id),
        );
    }

    return {
        id: extension.id,
        extensionKind: extension.extensionKind,
        version: semver.parse(extension.packageJSON.version) || new semver.SemVer('0.0.0'),
    };
}
