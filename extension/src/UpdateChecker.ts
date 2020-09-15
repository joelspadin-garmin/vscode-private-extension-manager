import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import * as nls from 'vscode-nls/node';

import { ExtensionInfoService } from './extensionInfo';
import { updateExtensions } from './install';
import { getLogger } from './logger';
import { Package } from './Package';
import { RegistryProvider } from './RegistryProvider';
import { getConfig } from './util';

const localize = nls.loadMessageBundle();

const INIT_DELAY_S = 5;
const DEFAULT_INTERVAL_S = 3600;

export class UpdateChecker implements Disposable {
    private disposable: Disposable;
    private initTimeout?: NodeJS.Timeout;
    private checkInterval?: NodeJS.Timeout;

    private intervalMS: number;

    private get isAutomaticUpdateEnabled() {
        return this.intervalMS > 0;
    }

    public constructor(
        private readonly registryProvider: RegistryProvider,
        private readonly extensionInfo: ExtensionInfoService,
    ) {
        this.intervalMS = getUpdateIntervalMS();

        this.disposable = Disposable.from(
            vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this),
        );

        if (this.isAutomaticUpdateEnabled) {
            this.initTimeout = global.setTimeout(() => {
                this.initTimeout = undefined;
                this.checkForUpdates(true);
                this.setAutomaticCheckInterval();
            }, INIT_DELAY_S * 1000);
        }
    }

    public dispose(): void {
        this.disposable.dispose();

        if (this.initTimeout) {
            global.clearTimeout(this.initTimeout);
            this.initTimeout = undefined;
        }

        if (this.checkInterval) {
            global.clearInterval(this.checkInterval);
            this.checkInterval = undefined;
        }
    }

    /**
     * Checks for any out-of-date extensions and prompts the user to update them
     * if any are found.
     * @param isAutomaticCheck `true` if this is an automatic check and it
     *      should run silently in the background unless an update is available.
     */
    public async checkForUpdates(isAutomaticCheck = false): Promise<void> {
        const updates = await this.getPackagesWithUpdates();

        if (updates.length > 0) {
            await this.showUpdatePrompt(updates);
        } else if (!isAutomaticCheck) {
            await this.showNoUpdatesMessage();
        }
    }

    /**
     * Checks for any out-of-date extensions and updates them if any are found.
     */
    public async updateAll(): Promise<void> {
        const updates = await this.getPackagesWithUpdates();

        if (updates.length > 0) {
            await updateExtensions(this.extensionInfo, updates);
        } else {
            await this.showNoUpdatesMessage();
        }
    }

    private setAutomaticCheckInterval() {
        if (this.checkInterval) {
            global.clearInterval(this.checkInterval);
        }

        if (this.isAutomaticUpdateEnabled) {
            this.checkInterval = global.setInterval(() => {
                getLogger().log(localize('start.update.check', 'Starting automatic update check'));
                this.checkForUpdates(true);
            }, this.intervalMS);
        }
    }

    private onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
        if (e.affectsConfiguration('privateExtensions.updateCheckInterval')) {
            this.intervalMS = getUpdateIntervalMS();
            this.setAutomaticCheckInterval();
        }
    }

    private async getPackagesWithUpdates() {
        const packages = await this.registryProvider.getUniquePackages();

        return packages.filter((pkg) => pkg.isUpdateAvailable);
    }

    private async showNoUpdatesMessage() {
        await vscode.window.showInformationMessage(
            localize('all.extensions.up.to.date', 'All private extensions are up to date.'),
        );
    }

    private async showUpdatePrompt(updates: Package[]) {
        const showUpdates = localize('show.updates', 'Show Updates');
        const updateAll = localize('update.all.extensions', 'Update All Extensions');

        const response = await vscode.window.showInformationMessage(
            localize('update.is.available', 'A private extension update is available.'),
            showUpdates,
            updateAll,
        );

        if (response === showUpdates) {
            await vscode.commands.executeCommand('privateExtensions.extensions.focus');
        } else if (response === updateAll) {
            await updateExtensions(this.extensionInfo, updates);
        }
    }
}

function getUpdateIntervalMS() {
    const config = getConfig();
    const interval = config.get<number>('updateCheckInterval', DEFAULT_INTERVAL_S);

    return interval * 1000;
}
