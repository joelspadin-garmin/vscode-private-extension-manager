import * as semver from 'semver';
import * as vscode from 'vscode';

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
 * Extension info returned by the remote helper extension.
 */
interface RemoteHelperExtensionInfo {
    id: string;
    extensionKind: vscode.ExtensionKind;
    packageJSON: any;
}

/**
 * Cache the info for each extension (keyed by extension ID) so we don't have to
 * repeatedly message the remote helper extension and/or parse the version
 * string if extensions haven't changed.
 *
 * Note that the entry for an extension ID can be `undefined`, which indicates
 * that we have looked up the extension and it wasn't installed.
 */
const extensionCache: Record<string, ExtensionInfo | undefined> = {};

let _onDidChange: vscode.EventEmitter<void>;
let myExtensionKind: vscode.ExtensionKind;

/**
 * An event which fires when any extension on the local or remote machine
 * changes. This can happen when extensions are installed, uninstalled, enabled
 * or disabled.
 */
export let onDidChange: vscode.Event<void>;

export function init(): vscode.Disposable {
    myExtensionKind = vscode.env.remoteName ? vscode.ExtensionKind.Workspace : vscode.ExtensionKind.UI;

    _onDidChange = new vscode.EventEmitter<void>();
    onDidChange = _onDidChange.event;

    return vscode.Disposable.from(
        _onDidChange,
        vscode.extensions.onDidChange(onMyExtensionsChanged),
        vscode.commands.registerCommand('_privateExtensionManager.notifyExtensionsChanged', onOtherExtensionsChanged),
    );
}

/**
 * Clears the extension information cache, forcing subsequent calls to
 * `getExtension()` to query information for all extensions again.
 */
export function clearCache() {
    clearCacheIf(() => true);
}

/**
 * Get an extension by its full identifier in the form `publisher.name`.
 *
 * Unlike `vscode.extensions.getExtension()`, this can provide info for
 * extensions on both the local and remote machines, but it provides a limited
 * subset of the extension information.
 */
export async function getExtension(extensionId: string): Promise<ExtensionInfo | undefined> {
    // Extension IDs are case insensitive. Normalize the case for the key so our
    // cache dictionary is also case insensitive.
    const key = extensionId.toLowerCase();

    // We store undefined in the cache for an extension that is not installed,
    // so check for the presence of the key to differentiate between not
    // installed and no data cached for the extension.
    if (extensionCache.hasOwnProperty(key)) {
        return extensionCache[key];
    }

    const result = await getExtensionNoCache(extensionId);
    extensionCache[key] = result;

    return result;
}

async function getExtensionNoCache(extensionId: string): Promise<ExtensionInfo | undefined> {
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
            console.warn('Failed to call remote helper', ex);
        }
    }

    return undefined;
}

function toExtensionInfo(extension: vscode.Extension<any> | RemoteHelperExtensionInfo): ExtensionInfo {
    if (typeof extension.packageJSON.version !== 'string') {
        throw new TypeError(`Package for extension ${extension.id} is missing version`);
    }

    return {
        id: extension.id,
        extensionKind: extension.extensionKind,
        version: semver.parse(extension.packageJSON.version) || new semver.SemVer('0.0.0'),
    };
}

/**
 * Invalidates cached info for extensions on the same machine as the extension
 * manager, and clears any extensions that are cached as being not installed.
 *
 * This should run whenever `vscode.extensions.onDidChange` event fires so that
 * `getExtensions()` returns up-to-date info for updated, installed, or
 * uninstalled extensions.
 */
function onMyExtensionsChanged() {
    clearCacheIf(cache => cache === undefined || cache.extensionKind === myExtensionKind);

    _onDidChange.fire();
}

/**
 * Invalidates cached info for extensions on the other machine, and clears any
 * extensions that are cached as being not installed.
 *
 * This should run whenever the remote helper extension indicates that its
 * `vscode.extensions.onDidChange` event fired, so that `getExtensions()`
 * returns up-to-date info for updated, installed, or uninstalled extensions.
 */
function onOtherExtensionsChanged() {
    clearCacheIf(cache => cache === undefined || cache.extensionKind !== myExtensionKind);

    _onDidChange.fire();
}

/**
 * Removes entries from the extension cache that match a predicate function.
 */
function clearCacheIf(predicate: (extension: ExtensionInfo | undefined) => boolean) {
    for (const key in extensionCache) {
        if (extensionCache.hasOwnProperty(key)) {
            if (predicate(extensionCache[key])) {
                delete extensionCache[key];
            }
        }
    }
}
