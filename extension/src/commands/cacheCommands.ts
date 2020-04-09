import cacache = require('cacache');
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import { Command } from '../commandManager';
import { getLogger } from '../logger';
import { getNpmCacheDir } from '../util';

const localize = nls.loadMessageBundle();

/**
 * Opens extensions.private.json to the "registries" element.
 */
export class CleanCacheCommand implements Command {
    public readonly id = 'privateExtensions.cleanCache';

    public async execute() {
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
