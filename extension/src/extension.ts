import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

import { CommandManager } from './commandManager';
import * as commands from './commands/index';
import { setContext } from './context';
import * as extensionInfo from './extensionInfo';
import { ExtensionsFileFeatures } from './extensionsFileFeatures';
import { RegistryProvider } from './RegistryProvider';
import { UpdateChecker } from './UpdateChecker';
import { deleteNpmDownloads } from './util';
import { RegistryView } from './views/registryView';

// TODO: provide autocomplete suggestions in extensions.private.json for
// registries: { "name": "Registry Name", "registry": "https://my-private.registry" }

// TODO: notify user if extensions.private.json recommends extensions that are
// not installed. Add a way to ignore for a workspace or disable globally.

// TODO: If https://github.com/Microsoft/vscode/issues/62783 is ever implemented,
// display a badge with the number of updates on the activity bar icon.

nls.config({ messageFormat: nls.MessageFormat.file })();

export function activate(context: vscode.ExtensionContext) {
    setContext(context);

    const disposable = extensionInfo.init();
    const registryProvider = new RegistryProvider();
    const registryView = new RegistryView(registryProvider);
    const updateChecker = new UpdateChecker(registryProvider);

    context.subscriptions.push(
        disposable,
        registryProvider,
        registryView,
        updateChecker,
        registerCommands(registryProvider, registryView, updateChecker),
        registerLanguageFeatures(registryProvider),
    );
}

export async function deactivate() {
    // TODO: should we have some sort of lock file or ref count so we don't
    // delete the cache if another instance of vscode is still active?
    await deleteNpmDownloads();
}

function registerCommands(
    registryProvider: RegistryProvider,
    registryView: RegistryView,
    updateChecker: UpdateChecker,
): vscode.Disposable {
    const commandManager = new CommandManager();

    commandManager.register(
        // Update commands
        new commands.CheckForUpdatesCommand(updateChecker),
        new commands.UpdateAllExtensionsCommand(updateChecker),

        // Extension commands
        new commands.ShowExtensionCommand(registryView),
        new commands.InstallExtensionCommand(registryProvider),
        new commands.UpdateExtensionCommand(registryProvider),
        new commands.UninstallExtensionCommand(),
        new commands.InstallAnotherVersionCommand(registryProvider),
        new commands.CopyExtensionInformationCommand(),

        // Registry commands
        new commands.AddUserRegistryCommand(registryProvider),
        new commands.RemoveUserRegistryCommand(registryProvider),

        // Tree view commands
        new commands.RefreshCommand(registryView),

        // Configuration commands
        new commands.ConfigureWorkspaceRegistries(),
        new commands.ConfigureRecommendedExtensions(),
    );

    return commandManager;
}

function registerLanguageFeatures(registryProvider: RegistryProvider): vscode.Disposable {
    return vscode.Disposable.from(new ExtensionsFileFeatures(registryProvider));
}
