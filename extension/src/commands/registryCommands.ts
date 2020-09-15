import { isWebUri } from 'valid-url';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { Command } from '../commandManager';
import { Registry } from '../Registry';
import { RegistryProvider } from '../RegistryProvider';

const localize = nls.loadMessageBundle();

export class AddUserRegistryCommand implements Command {
    public readonly id = 'privateExtensions.registry.add';

    public constructor(private readonly registryProvider: RegistryProvider) {}

    public async execute(): Promise<void> {
        const registry = await vscode.window.showInputBox({
            prompt: localize('registry.url.prompt', 'Enter the URL of the NPM registry.'),
            placeHolder: localize('registry.url.placeholder', 'https://my-private.registry'),
            validateInput: (value) => (isWebUri(value) ? null : localize('must.be.url', 'Value must be a valid URL.')),
            ignoreFocusOut: true,
        });

        if (!registry) {
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: localize('registry.name.prompt', 'Enter a name for the registry: {0}.', registry),
            placeHolder: localize('registry.name.placeholder', 'Registry name'),
            ignoreFocusOut: true,
        });

        if (!name) {
            return;
        }

        this.registryProvider.addUserRegistry(name, registry);

        const openSettingsJson = localize('open.settings.json', 'Open settings.json');
        const settingsJsonLink = `[${openSettingsJson}](command:workbench.action.openSettingsJson)`;

        await vscode.window.showInformationMessage(
            localize(
                'registry.added',
                'Registry "{0}" added. {1} and edit "privateExtensions.registries" to configure authentication or other settings.',
                name,
                settingsJsonLink,
            ),
        );
    }
}

export class RemoveUserRegistryCommand implements Command {
    public readonly id = 'privateExtensions.registry.remove';

    public constructor(private readonly registryProvider: RegistryProvider) {}

    public async execute(registry?: Registry): Promise<void> {
        if (!registry) {
            registry = await this.showUserRegistryPrompt();

            if (!registry) {
                // User canceled input.
                return;
            }
        }

        this.registryProvider.removeUserRegistry(registry.name);

        await vscode.window.showInformationMessage(
            localize('registry.removed', 'Registry "{0}" removed.', registry.name),
        );
    }

    private async showUserRegistryPrompt() {
        const registries = this.registryProvider.getUserRegistries();

        if (registries.length === 0) {
            vscode.window.showInformationMessage(localize('no.user.registries', 'There are no user registries.'));
            return undefined;
        }

        const items = registries.map(
            (registry) =>
                ({
                    label: registry.name,
                    description: registry.uri?.toString(),
                } as vscode.QuickPickItem),
        );

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: localize('select.registry.to.remove', 'Select a registry to remove.'),
            matchOnDescription: true,
        });

        if (selected) {
            return registries.find((registry) => registry.name === selected.label);
        } else {
            return undefined;
        }
    }
}
