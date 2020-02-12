import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import * as extensionInfo from './extensionInfo';
import { findPackage } from './findPackage';
import { Package } from './Package';
import { Registry } from './Registry';
import { RegistryProvider } from './RegistryProvider';

const localize = nls.loadMessageBundle();

/**
 * If an extension takes longer than this to install/uninstall, assume VS Code
 * needs to be reloaded for it to take effect.
 */
const EXTENSION_CHANGE_TIMEOUT_MS = 2000;

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
export async function uninstallExtension(pkgOrExtId: Package | string) {
    const extensionId = pkgOrExtId instanceof Package ? pkgOrExtId.extensionId : pkgOrExtId;
    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extensionId);

    return extensionId;
}

/**
 * Updates all the given extensions to their latest versions and prompts the
 * user to reload the window if necessary.
 * @param packages The packages to update.
 */
export async function updateExtensions(packages: Package[]) {
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

                await wrapExtensionChange(installExtension(pkg));

                progress.report({ increment });
            }
        },
    );

    if (!packages.every(didExtensionUpdate)) {
        await showReloadPrompt(
            localize(
                'reload.to.complete.update.all',
                'Please reload Visual Studio Code to complete updating the extensions.',
            ),
        );
    }
}

/**
 * Gets whether the currently-installed version of the extension is newer than
 * the version of the given package.
 */
export async function didExtensionUpdate(pkg: Package) {
    const extension = await extensionInfo.getExtension(pkg.extensionId);
    if (!extension) {
        console.error(`Extension ${pkg.extensionId} missing after update`);
        return false;
    }

    return extension.version > pkg.version;
}

/**
 * Displays a message with a button to reload vscode.
 * @param message The message to display.
 */
export async function showReloadPrompt(message: string) {
    const reload = await vscode.window.showInformationMessage(message, localize('reload.now', 'Reload Now'));
    if (reload) {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
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
export async function wrapExtensionChange<T>(
    task: Promise<T>,
    timeout: number = EXTENSION_CHANGE_TIMEOUT_MS,
): Promise<T> {
    const wait = waitForExtensionChange(timeout);

    const [result] = await Promise.all([task, wait]);

    return result;
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

/**
 * Wait for either `vscode.extensions.onDidChange()` to fire or `timeout`
 * milliseconds to elapse.
 */
function waitForExtensionChange(timeout: number): Promise<void> {
    return new Promise(resolve => {
        function finished() {
            global.clearTimeout(handle);
            event.dispose();
            resolve();
        }

        const handle = global.setTimeout(finished, timeout);
        const event = extensionInfo.onDidChange(finished);
    });
}
