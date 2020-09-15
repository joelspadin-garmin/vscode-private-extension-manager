import cacache = require('cacache');
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { Command } from '../commandManager';
import { getLogger } from '../logger';
import { getNpmCacheDir, rimrafPromise } from '../util';

const localize = nls.loadMessageBundle();

export class DeleteCacheCommand implements Command {
    public readonly id = 'privateExtensions.cache.delete';

    public async execute(): Promise<void> {
        const cache = getNpmCacheDir();

        if (!cache) {
            vscode.window.showInformationMessage(localize('cache.already.deleted', 'NPM cache is already deleted.'));
            return;
        }

        vscode.window.withProgress(
            {
                title: localize('deleting.npm.cache', 'Deleting NPM cache.'),
                location: vscode.ProgressLocation.Notification,
            },
            async () => {
                await rimrafPromise(cache);
                getLogger().log(`Deleted NPM cache: ${cache}`);
            },
        );
    }
}

/**
 * Cleans and fixes up the NPM cache.
 */
export class GarbageCollectCacheCommand implements Command {
    public readonly id = 'privateExtensions.cache.garbageCollect';

    public async execute(): Promise<void> {
        const cache = getNpmCacheDir();

        if (!cache) {
            vscode.window.showErrorMessage(localize('cache.missing', 'NPM cache is missing.'));
            return;
        }

        vscode.window.withProgress(
            {
                title: localize('cleaning.npm.cache', 'Cleaning NPM cache.'),
                location: vscode.ProgressLocation.Notification,
            },
            async () => {
                const stats = await cacache.verify(cache);
                getLogger().log(`Cleaned NPM cache: ${JSON.stringify(stats)}`);
            },
        );
    }
}
