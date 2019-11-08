import * as semver from 'semver';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import * as install from '../install';
import { Command } from '../commandManager';
import { getExtension } from '../extensionInfo';
import { Package } from '../Package';
import { RegistryView } from '../views/registryView';
import { RegistryProvider } from '../RegistryProvider';
import { getPackageVersions, findPackage } from '../findPackage';

const localize = nls.loadMessageBundle();

/**
 * Opens the extension details view for an extension.
 */
export class ShowExtensionCommand implements Command {
    public readonly id = 'privateExtensions.extension.show';

    constructor(private readonly registryView: RegistryView) {}

    public async execute(extension: Package) {
        await this.registryView.showExtension(extension);
    }
}

/**
 * Installs an extension.
 */
export class InstallExtensionCommand implements Command {
    public readonly id = 'privateExtensions.extension.install';

    constructor(private readonly registryProvider: RegistryProvider) {}

    public async execute(extensionOrId: Package | string) {
        const pkg = await install.wrapExtensionChange(installExtension(this.registryProvider, extensionOrId));

        // If vscode could immediately load the extension, it should be visible
        // to the extensions API now. If not, we need to reload.
        if (!(await getExtension(pkg.extensionId))) {
            await showInstallReloadPrompt(pkg);
        }
    }
}

/**
 * Updates an extension to the latest version.
 */
export class UpdateExtensionCommand implements Command {
    public readonly id = 'privateExtensions.extension.update';

    constructor(private readonly registryProvider: RegistryProvider) {}

    public async execute(extensionOrId: Package | string) {
        const pkg = await install.wrapExtensionChange(installExtension(this.registryProvider, extensionOrId));

        // If vscode could immediately load the updated extension, we should see
        // the new version number reflected in the extensions API. If not, we
        // need to reload.
        if (!(await install.didExtensionUpdate(pkg))) {
            await install.showReloadPrompt(
                localize(
                    'reload.to.complete.update',
                    'Please reload Visual Studio Code to complete updating the extension {0}.',
                    pkg.displayName,
                ),
            );
        }
    }
}

/**
 * Uninstalls an extension.
 */
export class UninstallExtensionCommand implements Command {
    public readonly id = 'privateExtensions.extension.uninstall';

    public async execute(extensionOrId: Package | string) {
        const extensionId = await install.wrapExtensionChange(install.uninstallExtension(extensionOrId));

        // If vscode could immediately unload the extension, it should no longer
        // be visible to the extensions API now. If it is, we need to reload.
        if (await getExtension(extensionId)) {
            await install.showReloadPrompt(
                localize(
                    'reload.to.complete.uninstall',
                    'Please reload Visual Studio Code to complete uninstalling the extension {0}.',
                    extensionId,
                ),
            );
        }
    }
}

/**
 * Installs a specific version of an extension.
 */
export class InstallAnotherVersionCommand implements Command {
    public readonly id = 'privateExtensions.extension.install.anotherVersion';

    constructor(private readonly registryProvider: RegistryProvider) {}

    /**
     * @param extensionOrId Either the latest `Package` for an extension, or the ID of the extension to install.
     * @param version The specific version to install. If omitted, this prompts the user to select a version.
     */
    public async execute(extensionOrId: Package | string, version?: string) {
        const latest = await this.getLatestPackage(extensionOrId);

        if (!version) {
            version = await this.showVersionPrompt(latest);
        }

        if (version) {
            if (semver.eq(version, latest.version)) {
                await vscode.window.showInformationMessage(
                    localize(
                        'version.already.installed',
                        '{0} version {1} is already installed.',
                        latest.displayName,
                        version,
                    ),
                );
            } else {
                const id = `${latest.extensionId}@${version}`;

                const pkg = await install.installExtension(this.registryProvider, id);

                // Assume that we always need to reload after installing a
                // different version. This command won't be used frequently, and
                // checking if vscode updated to the specific version is more
                // trouble than it's worth.
                await showInstallReloadPrompt(pkg);
            }
        }
    }

    private async getLatestPackage(extensionOrId: Package | string) {
        return extensionOrId instanceof Package
            ? extensionOrId
            : await findPackage(this.registryProvider, extensionOrId);
    }

    private async showVersionPrompt(latest: Package) {
        const result = await vscode.window.showQuickPick(this.getQuickPickItems(latest), {
            placeHolder: localize('select.version', 'Select Version to Install'),
        });

        return result ? result.label : undefined;
    }

    private async getQuickPickItems(latest: Package) {
        const versions = await getPackageVersions(this.registryProvider, latest.extensionId);

        return versions.map(version => {
            const relativeTime = version.time ? getRelativeDateLabel(version.time) : '';

            const currentTag = semver.eq(version.version, latest.version) ? ` (${localize('current', 'Current')})` : '';

            return {
                label: version.version.toString(),
                description: `${relativeTime}${currentTag}`,
            } as vscode.QuickPickItem;
        });
    }
}

/**
 * Copies extension information to the clipboard.
 */
export class CopyExtensionInformationCommand implements Command {
    public readonly id = 'privateExtensions.extension.copyInformation';

    public async execute(extension: Package) {
        const name = localize('extensionInfoName', 'Name: {0}', extension.displayName);
        const id = localize('extensionInfoId', 'Id: {0}', extension.extensionId);
        const description = localize('extensionInfoDescription', 'Description: {0}', extension.description);
        const version = localize('extensionInfoVersion', 'Version: {0}', extension.version.toString());
        const publisher = localize('extensionInfoPublisher', 'Publisher: {0}', extension.publisher);
        const registry = extension.registry.uri
            ? localize('extensionInfoRegistry', 'Registry: {0}', extension.registry.uri.toString())
            : null;

        const clipboardStr = [name, id, description, version, publisher, registry].filter(x => !!x).join('\n');

        await vscode.env.clipboard.writeText(clipboardStr);
    }
}

/**
 * Installs an extension given a package or the extension ID and a registry provider to search.
 * @returns the Package for the installed extension.
 */
function installExtension(provider: RegistryProvider, extensionOrId: Package | string) {
    if (extensionOrId instanceof Package) {
        return install.installExtension(extensionOrId);
    } else {
        return install.installExtension(provider, extensionOrId);
    }
}

async function showInstallReloadPrompt(pkg: Package) {
    return await install.showReloadPrompt(
        localize(
            'reload.to.complete.install',
            'Please reload Visual Studio Code to complete installing the extension {0}.',
            pkg.displayName,
        ),
    );
}

// https://github.com/microsoft/vscode/blob/master/src/vs/workbench/contrib/extensions/browser/extensionsActions.ts
function getRelativeDateLabel(date: Date): string {
    const delta = new Date().getTime() - date.getTime();

    const year = 365 * 24 * 60 * 60 * 1000;
    if (delta > year) {
        const noOfYears = Math.floor(delta / year);
        return noOfYears > 1
            ? localize('noOfYearsAgo', '{0} years ago', noOfYears)
            : localize('one year ago', '1 year ago');
    }

    const month = 30 * 24 * 60 * 60 * 1000;
    if (delta > month) {
        const noOfMonths = Math.floor(delta / month);
        return noOfMonths > 1
            ? localize('noOfMonthsAgo', '{0} months ago', noOfMonths)
            : localize('one month ago', '1 month ago');
    }

    const day = 24 * 60 * 60 * 1000;
    if (delta > day) {
        const noOfDays = Math.floor(delta / day);
        return noOfDays > 1 ? localize('noOfDaysAgo', '{0} days ago', noOfDays) : localize('one day ago', '1 day ago');
    }

    const hour = 60 * 60 * 1000;
    if (delta > hour) {
        const noOfHours = Math.floor(delta / day);
        return noOfHours > 1
            ? localize('noOfHoursAgo', '{0} hours ago', noOfHours)
            : localize('one hour ago', '1 hour ago');
    }

    if (delta > 0) {
        return localize('just now', 'Just now');
    }

    return '';
}
