import * as semver from 'semver';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { Command } from '../commandManager';
import { ExtensionInfoService } from '../extensionInfo';
import { findPackage, getPackageChannels, getPackageVersions } from '../findPackage';
import * as install from '../install';
import { Package } from '../Package';
import { RegistryProvider } from '../RegistryProvider';
import { setReleaseChannel } from '../releaseChannel';
import { RegistryView } from '../views/registryView';

const localize = nls.loadMessageBundle();

/**
 * Opens the extension details view for an extension.
 */
export class ShowExtensionCommand implements Command {
    public readonly id = 'privateExtensions.extension.show';

    constructor(private readonly registryView: RegistryView) {}

    public async execute(extension: Package): Promise<void> {
        await this.registryView.showExtension(extension);
    }
}

/**
 * Installs an extension.
 */
export class InstallExtensionCommand implements Command {
    public readonly id = 'privateExtensions.extension.install';

    constructor(
        private readonly registryProvider: RegistryProvider,
        private readonly extensionInfo: ExtensionInfoService,
    ) {}

    public async execute(extensionOrId: Package | string): Promise<void> {
        const pkg = await this.extensionInfo.waitForExtensionChange(
            installExtension(this.registryProvider, extensionOrId),
        );

        // If vscode could immediately load the extension, it should be visible
        // to the extensions API now. If not, we need to reload.
        if (!(await this.extensionInfo.getExtension(pkg.extensionId))) {
            await showInstallReloadPrompt(pkg);
        }
    }
}

/**
 * Updates an extension to the latest version.
 */
export class UpdateExtensionCommand implements Command {
    public readonly id = 'privateExtensions.extension.update';

    constructor(
        private readonly registryProvider: RegistryProvider,
        private readonly extensionInfo: ExtensionInfoService,
    ) {}

    public async execute(extensionOrId: Package | string): Promise<void> {
        const pkg = await this.extensionInfo.waitForExtensionChange(
            installExtension(this.registryProvider, extensionOrId),
        );

        // If vscode could immediately load the updated extension, we should see
        // the new version number reflected in the extensions API. If not, we
        // need to reload.
        if (!(await this.extensionInfo.didExtensionUpdate(pkg))) {
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

    constructor(private readonly extensionInfo: ExtensionInfoService) {}

    public async execute(extensionOrId: Package | string): Promise<void> {
        const extensionId = await this.extensionInfo.waitForExtensionChange(install.uninstallExtension(extensionOrId));

        // If vscode could immediately unload the extension, it should no longer
        // be visible to the extensions API now. If it is, we need to reload.
        if (await this.extensionInfo.getExtension(extensionId)) {
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
    public async execute(extensionOrId: Package | string, version?: string): Promise<void> {
        const latest = await getLatestPackage(this.registryProvider, extensionOrId);

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
                const pkg = await install.installExtension(this.registryProvider, latest.extensionId, version);

                // Assume that we always need to reload after installing a
                // different version. This command won't be used frequently, and
                // checking if vscode updated to the specific version is more
                // trouble than it's worth.
                await showInstallReloadPrompt(pkg);
            }
        }
    }

    private async showVersionPrompt(latest: Package) {
        const result = await vscode.window.showQuickPick(this.getQuickPickItems(latest), {
            placeHolder: localize('select.version', 'Select Version to Install'),
        });

        return result ? result.label : undefined;
    }

    private async getQuickPickItems(latest: Package) {
        const versions = await getPackageVersions(this.registryProvider, latest.extensionId);

        // Sort newer versions to the top
        versions.sort((a, b) => semver.rcompare(a.version, b.version));

        return versions.map((version) => {
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
 * Switches which release channel to track for an extension.
 */
export class SwitchChannelsCommand implements Command {
    public readonly id = 'privateExtensions.extension.switchChannels';

    constructor(private readonly registryProvider: RegistryProvider) {}

    /**
     * @param extensionOrId Either the latest `Package` for an extension, or the ID of the extension to modify.
     * @param channel The channel to switch to. If omitted, this prompts the user to select a version.
     */
    public async execute(extensionOrId: Package | string, channel?: string): Promise<void> {
        const pkg = await getLatestPackage(this.registryProvider, extensionOrId);

        if (!channel) {
            channel = await this.showChannelPrompt(pkg);
        }

        if (channel) {
            if (channel === pkg.channel) {
                await vscode.window.showInformationMessage(
                    localize(
                        'package.already.tracking.channel',
                        '{0} is already tracking {1}.',
                        pkg.displayName,
                        channel,
                    ),
                );
            } else {
                setReleaseChannel(pkg.extensionId, channel);

                await this.showChannelChangedMessage(pkg, channel);
            }
        }
    }

    private async showChannelPrompt(latest: Package) {
        const result = await vscode.window.showQuickPick(this.getQuickPickItems(latest), {
            placeHolder: localize('select.channel', 'Select Release Channel'),
        });

        return result ? result.label : undefined;
    }

    private async getQuickPickItems(pkg: Package) {
        const channels = await getPackageChannels(this.registryProvider, pkg.extensionId);

        // Sort newer versions to the top
        const sorted = [...channels.entries()].sort((a, b) => {
            const version1 = a[1];
            const version2 = b[1];
            return semver.rcompare(version1.version, version2.version);
        });

        return sorted.map(([channel, version]) => {
            const relativeTime = version.time ? getRelativeDateLabel(version.time) : '';
            const currentTag = channel === pkg.channel ? ` (${localize('current', 'Current')})` : '';

            return {
                label: channel,
                description: `${version.version} - ${relativeTime}${currentTag}`,
            } as vscode.QuickPickItem;
        });
    }

    private async showChannelChangedMessage(pkg: Package, channel: string) {
        const items: string[] = [];

        // If we aren't already at the latest version for the new channel, give
        // the option to update to it.
        const latest = await getLatestPackage(this.registryProvider, pkg.extensionId, channel);

        // Update state first to ensure installedVersion is valid.
        await pkg.updateState();
        if (!pkg.installedVersion || semver.neq(pkg.installedVersion, latest.version)) {
            items.push(localize('update.to.version', 'Update to version {0}', latest.version.toString()));
        }

        const doUpdate = await vscode.window.showInformationMessage(
            localize('package.now.tracking.channel', '{0} is now tracking {1}.', pkg.displayName, channel),
            ...items,
        );

        if (doUpdate) {
            await installExtension(this.registryProvider, latest);

            // Assume that we always need to reload after installing a
            // different version. This command won't be used frequently, and
            // checking if vscode updated to the specific version is more
            // trouble than it's worth.
            await showInstallReloadPrompt(latest);
        }
    }
}

/**
 * Copies extension information to the clipboard.
 */
export class CopyExtensionInformationCommand implements Command {
    public readonly id = 'privateExtensions.extension.copyInformation';

    public async execute(extension: Package): Promise<void> {
        const name = localize('extensionInfoName', 'Name: {0}', extension.displayName);
        const id = localize('extensionInfoId', 'Id: {0}', extension.extensionId);
        const description = localize('extensionInfoDescription', 'Description: {0}', extension.description);
        const version = localize('extensionInfoVersion', 'Version: {0}', extension.version.toString());
        const publisher = localize('extensionInfoPublisher', 'Publisher: {0}', extension.publisher);
        const registry = extension.registry.uri
            ? localize('extensionInfoRegistry', 'Registry: {0}', extension.registry.uri.toString())
            : null;

        const clipboardStr = [name, id, description, version, publisher, registry].filter((x) => !!x).join('\n');

        await vscode.env.clipboard.writeText(clipboardStr);
    }
}

/**
 * Gets the latest package for an extension.
 * @param channel Release channel to track. If omitted, returns the latest version for the user's selected release channel.
 */
async function getLatestPackage(registryProvider: RegistryProvider, extensionOrId: Package | string, channel?: string) {
    return extensionOrId instanceof Package
        ? extensionOrId
        : await findPackage(registryProvider, extensionOrId, channel);
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
