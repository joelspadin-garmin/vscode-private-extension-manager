import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { ExtensionInfoService } from './extensionInfo';
import { findPackage } from './findPackage';
import { Package } from './Package';
import { Registry } from './Registry';
import { RegistryProvider } from './RegistryProvider';
import { getConfig, sleep } from './util';

const localize = nls.loadMessageBundle();

const DEFAULT_AUTO_RELOAD = false;
const CANCEL_MESSAGE = localize('cancel', 'Cancel');

export enum ReloadReason {
    Install,
    Uninstall,
    Update,
    UpdateAll,
}

/**
 * Installs the given extension package.
 * @returns the installed package.
 */
export async function installExtension(pkg: Package): Promise<Package>;
/**
 * Installs the extension with the given ID, searching one or more registries
 * @param registry The registry containing the extension package, or a registry provider to search
 * @param extensionId The ID of the extension to install.
 * @param version Version or dist-tag such as "1.0.0" to find a specific version of the extension.
 *              If omitted, returns the latest version for the user's selected release channel.
 * @returns the installed package.
 */
export async function installExtension(
    registry: Registry | RegistryProvider,
    extensionId: string,
    version?: string,
): Promise<Package>;
export async function installExtension(
    pkgOrRegistry: Package | Registry | RegistryProvider,
    extensionId?: string,
    version?: string,
): Promise<Package> {
    if (pkgOrRegistry instanceof Package) {
        await installExtensionByPackage(pkgOrRegistry);
        return pkgOrRegistry;
    } else {
        const registry = pkgOrRegistry;

        if (extensionId === undefined) {
            throw new TypeError('extensionId must be defined');
        }

        return await installExtensionById(registry, extensionId, version);
    }
}

/**
 * Uninstalls the given extension.
 * @param pkgOrExtId The package or extension ID of the extension to uninstall.
 * @returns the ID of the uninstalled extension.
 */
export async function uninstallExtension(pkgOrExtId: Package | string): Promise<string> {
    const extensionId = pkgOrExtId instanceof Package ? pkgOrExtId.extensionId : pkgOrExtId;
    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extensionId);

    return extensionId;
}

/**
 * Updates all the given extensions to their latest versions and prompts the
 * user to reload the window if necessary.
 * @param packages The packages to update.
 */
export async function updateExtensions(extensionInfo: ExtensionInfoService, packages: Package[]): Promise<void> {
    const increment = 100 / packages.length;

    await vscode.window.withProgress(
        {
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: localize('updating.extensions', 'Updating extensions...'),
        },
        async (progress, token) => {
            for (const pkg of packages) {
                if (token.isCancellationRequested) {
                    break;
                }

                await extensionInfo.waitForExtensionChange(installExtension(pkg));

                progress.report({ increment });
            }
        },
    );

    // Array.prototype.every() does not support Promises
    // Build an array of promise and use it as provided function for every()

    const promiseArray = packages.map((pkg) => extensionInfo.didExtensionUpdate(pkg));

    if (packages.every((value, index) => promiseArray[index])) {
        await showReloadPrompt(ReloadReason.UpdateAll);
    }
}

/**
 * Compute the message for a manual reload
 * @param reason The reason to reload VSCode.
 * @param extension Name of the extension that was changed.
 */
function getReloadPromptMessage(reason: ReloadReason, extension?: string): string {
    switch (reason) {
        case ReloadReason.Install:
            return localize(
                'reload.to.complete.install',
                'Please reload Visual Studio Code to complete installing the extension {0}.',
                extension,
            );
        case ReloadReason.Uninstall:
            return localize(
                'reload.to.complete.uninstall',
                'Please reload Visual Studio Code to complete uninstalling the extension {0}.',
                extension,
            );
        case ReloadReason.Update:
            return localize(
                'reload.to.complete.update',
                'Please reload Visual Studio Code to complete updating the extension {0}.',
                extension,
            );
        case ReloadReason.UpdateAll:
            return localize(
                'reload.to.complete.update.all',
                'Please reload Visual Studio Code to complete updating the extensions.',
            );
        default:
            return localize(
                'reload.to.complete.changes',
                'Please reload Visual Studio Code to complete changes to private extensions.',
            );
    }
}

/**
 * Compute the message for AutoReload
 * @param reason The reason to reload VSCode.
 * @param extension Name of the extension that was changed.
 */
function getAutoReloadMessage(reason: ReloadReason, extension?: string): string {
    switch (reason) {
        case ReloadReason.Install:
            return localize(
                'autoreload.to.complete.install',
                'Visual Studio Code will restart in 3 seconds to complete installing the extension {0}.',
                extension,
            );
        case ReloadReason.Uninstall:
            return localize(
                'autoreload.to.complete.uninstall',
                'Visual Studio Code will restart in 3 seconds to complete uninstalling the extension {0}.',
                extension,
            );
        case ReloadReason.Update:
            return localize(
                'autoreload.to.complete.update',
                'Visual Studio Code will restart in 3 seconds to complete updating the extension {0}.',
                extension,
            );
        case ReloadReason.UpdateAll:
            return localize(
                'autoreload.to.complete.update.all',
                'Visual Studio Code will restart in 3 seconds to complete updating the extensions.',
            );
        default:
            return localize(
                'autoreload.to.complete.changes',
                'Visual Studio Code will restart in 3 seconds to complete changes to private extensions.',
            );
    }
}

/**
 * Displays a message with a button to reload vscode.
 * @param reason The reason to reload VSCode.
 * @param extension Name of the extension that was changed.
 */
export async function showReloadPrompt(reason: ReloadReason, extension?: string): Promise<void> {
    let reload: boolean;

    if (getAutoReload()) {
        const message = getAutoReloadMessage(reason, extension);
        const cancel = vscode.window.showInformationMessage(message, CANCEL_MESSAGE);
        const timeout = sleep(3000);
        const result = await Promise.race([cancel, timeout]);
        reload = result !== CANCEL_MESSAGE;
    } else {
        const message = getReloadPromptMessage(reason, extension);
        const reloadMessage = localize('reload.now', 'Reload Now');
        const result = await vscode.window.showInformationMessage(message, reloadMessage);
        reload = result === reloadMessage;
    }
    if (reload) {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

/**
 * Installs the given extension package.
 * @param pkg
 */
async function installExtensionByPackage(pkg: Package) {
    const { vsix } = await pkg.getContents();

    if (!vsix) {
        throw new Error(
            localize('extension.missing.vsix', 'Extension {0} does not contain a .vsix package.', pkg.toString()),
        );
    }

    await vscode.commands.executeCommand('workbench.extensions.installExtension', vsix);
}

/**
 * Installs the extension with the given ID, searching one or more registries
 * @param registry The registry containing the extension package, or a registry provider to search
 * @param extensionId The ID of the extension to install.
 * @param version Version or dist-tag such as "1.0.0" to find a specific version of the extension.
 *              If omitted, returns the latest version for the user's selected release channel.
 */
async function installExtensionById(registry: Registry | RegistryProvider, extensionId: string, version?: string) {
    const pkg = await findPackage(registry, extensionId, version);

    await installExtensionByPackage(pkg);

    return pkg;
}

function getAutoReload() {
    const config = getConfig();
    const autoUpdate = config.get<boolean>('autoReload', DEFAULT_AUTO_RELOAD);

    return autoUpdate;
}
