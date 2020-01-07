import * as fs from 'fs';
import * as t from 'io-ts';
import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable, Event, EventEmitter } from 'vscode';
import * as nls from 'vscode-nls';

import { Package } from './Package';
import { Registry, RegistrySource } from './Registry';
import { assertType, options } from './typeUtil';
import { getConfig, readJSONSync } from './util';

const localize = nls.loadMessageBundle();

const UserRegistry = options(
    {
        name: t.string,
    },
    {
        registry: t.string,
    },
);
type UserRegistry = t.TypeOf<typeof UserRegistry>;

const ExtensionsConfig = t.partial({
    registries: t.array(UserRegistry),
    recommendations: t.array(t.string),
});
type ExtensionsConfig = t.TypeOf<typeof ExtensionsConfig>;

/**
 * Provides NPM registries collected from user and workspace configuration.
 */
export class RegistryProvider implements Disposable {
    private _onDidChangeRegistries = new EventEmitter<void>();

    /**
     * An event that is emitted when the registry configuration changes.
     */
    public readonly onDidChangeRegistries: Event<void> = this._onDidChangeRegistries.event;

    private disposable: Disposable;
    private folders: FolderRegistryProvider[] = [];
    private isStale = true;
    private userRegistries: Registry[] = [];

    constructor() {
        this.disposable = Disposable.from(
            vscode.workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders, this),
            vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this),
        );

        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                this.addFolder(folder);
            }
        }
    }

    public dispose() {
        this.disposable.dispose();
        this.folders.map(f => f.dispose());
    }

    /**
     * Clears all cached information so that the next call to `getRegistries()`
     * will return a fresh list of registries and calling `getPackages()` on
     * each registry will return a fresh list of packages.
     *
     * This also fires the `onDidChangeRegistries` event.
     */
    public refresh() {
        this.isStale = true;

        for (const folder of this.folders) {
            folder.refresh();
        }

        this._onDidChangeRegistries.fire();
    }

    /**
     * Gets a list of registries for the current workspace.
     *
     * This includes registries defined in user settings.
     */
    public getRegistries() {
        const registries: Registry[] = [];

        // dedupeRegistries() keeps the first item for each duplicate registry.
        // Add workspace registries first so they override duplicate items in
        // the user configuration.
        for (const folder of this.folders) {
            registries.push(...folder.getRegistries());
        }

        registries.push(...this.getUserRegistries());

        return dedupeRegistries(registries);
    }

    /**
     * Gets the list of registries defined in user settings.
     */
    public getUserRegistries(): readonly Registry[] {
        if (this.isStale) {
            this.updateUserRegistries();
            this.isStale = false;
        }

        return this.userRegistries;
    }

    /**
     * Gets a list of extension IDs for extensions recommended for users of the
     * current workspace.
     */
    public getRecommendedExtensions() {
        const extensions = new Set<string>();

        for (const folder of this.folders) {
            for (const name of folder.getRecommendedExtensions()) {
                extensions.add(name);
            }
        }

        return extensions;
    }

    /**
     * Gets all packages with unique extension IDs from all registries
     * for the current workspace.
     */
    public async getUniquePackages() {
        const results = new Map<string, Package>();

        for (const registry of this.getRegistries()) {
            for (const pkg of await registry.getPackages()) {
                results.set(pkg.extensionId, pkg);
            }
        }

        return [...results.values()];
    }

    public addUserRegistry(name: string, registry: string) {
        const userRegistries = this.getUserRegistryConfig();

        if (userRegistries.some(other => name === other.name)) {
            throw new Error(localize('registry.exists', 'A registry named "{0}" already exists', name));
        }

        userRegistries.push({
            name,
            registry,
        });

        this.setUserRegistryConfig(userRegistries);
    }

    public removeUserRegistry(name: string) {
        const userRegistries = this.getUserRegistryConfig();
        const newRegistries = userRegistries.filter(registry => registry.name !== name);

        if (newRegistries.length === userRegistries.length) {
            throw new Error(localize('registry.does.not.exist', 'No registry named "{0}" exists.', name));
        }

        this.setUserRegistryConfig(newRegistries);
    }

    private getUserRegistryConfig(): UserRegistry[] {
        const userRegistries = getConfig().get<any>('registries', []);

        assertType(
            userRegistries,
            t.array(UserRegistry),
            localize('user.setting.invalid', 'privateExtensions.registries setting is invalid'),
        );

        return userRegistries;
    }

    private setUserRegistryConfig(registries: readonly UserRegistry[]) {
        getConfig().update('registries', registries, vscode.ConfigurationTarget.Global);
    }

    private updateUserRegistries() {
        this.userRegistries = [];

        const userRegistries = this.getUserRegistryConfig();

        for (const item of userRegistries) {
            const { name, ...options } = item;
            this.userRegistries.push(new Registry(name, RegistrySource.User, options));
        }
    }

    private onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
        if (
            e.affectsConfiguration('privateExtensions.registries') ||
            e.affectsConfiguration('privateExtensions.channels')
        ) {
            this.isStale = true;
            this._onDidChangeRegistries.fire();
        }
    }

    private onDidChangeWorkspaceFolders(e: vscode.WorkspaceFoldersChangeEvent) {
        e.removed.map(folder => this.removeFolder(folder));
        e.added.map(folder => this.addFolder(folder));
        this._onDidChangeRegistries.fire();
    }

    private addFolder(folder: vscode.WorkspaceFolder) {
        const idx = this.folders.findIndex(value => value.folder === folder);
        if (idx >= 0) {
            console.error('Already have folder:', folder.uri);
        } else {
            const provider = new FolderRegistryProvider(folder);
            this.folders.push(provider);

            provider.onDidChangeRegistries(() => this._onDidChangeRegistries.fire());
        }
    }

    private removeFolder(folder: vscode.WorkspaceFolder) {
        const idx = this.folders.findIndex(value => value.folder === folder);
        if (idx >= 0) {
            const removed = this.folders.splice(idx, 1);
            removed.map(f => f.dispose());
        }
    }
}

/**
 * Provides NPM registries for one workspace folder.
 */
class FolderRegistryProvider implements Disposable {
    private _onDidChangeRegistries = new EventEmitter<void>();

    /**
     * An event that is emitted when the registry configuration changes.
     */
    public readonly onDidChangeRegistries: Event<void> = this._onDidChangeRegistries.event;

    private static readonly ConfigGlobPattern = 'extensions.private.json';

    private readonly configFolder: string;
    private isStale = true;
    private configFile: vscode.Uri | null;
    private disposable: Disposable;
    private configFileWatcher: vscode.FileSystemWatcher;
    private registries: Registry[] = [];
    private recommendedExtensions: string[] = [];

    constructor(public readonly folder: vscode.WorkspaceFolder) {
        this.configFolder = path.join(folder.uri.fsPath, '.vscode');

        const configFilePath = path.join(this.configFolder, FolderRegistryProvider.ConfigGlobPattern);
        this.configFileWatcher = vscode.workspace.createFileSystemWatcher(configFilePath);

        if (fs.existsSync(configFilePath)) {
            this.configFile = vscode.Uri.file(configFilePath);
        } else {
            this.configFile = null;
        }

        this.configFileWatcher.onDidCreate(uri => {
            this.configFile = uri;
            this.handleConfigChange();
        });

        this.configFileWatcher.onDidDelete(uri => {
            this.configFile = null;
            this.handleConfigChange();
        });

        this.configFileWatcher.onDidChange(uri => {
            this.handleConfigChange();
        });

        this.disposable = Disposable.from(this.configFileWatcher);
    }

    public dispose() {
        this.disposable.dispose();
    }

    /**
     * Clears all cached information so that the next call to `getRegistries()`
     * returns a fresh list of registries.
     */
    public refresh() {
        this.isStale = true;
    }

    public getRegistries() {
        this.updateRegistries();
        return this.registries;
    }

    public getRecommendedExtensions() {
        this.updateRegistries();
        return this.recommendedExtensions;
    }

    private handleConfigChange() {
        this.isStale = true;
        this._onDidChangeRegistries.fire();
    }

    private updateRegistries() {
        if (this.isStale) {
            this.readConfigFile();
            this.isStale = false;
        }
    }

    private readConfigFile() {
        this.registries = [];
        this.recommendedExtensions = [];

        if (!this.configFile) {
            return;
        }

        const config = readJSONSync(this.configFile);

        assertType(config, ExtensionsConfig, localize('in.file', 'In {0}', this.configFile.fsPath));

        if (config.registries) {
            for (const registry of config.registries) {
                const { name, ...options } = registry;
                this.registries.push(new Registry(name, RegistrySource.Workspace, options));
            }
        }

        if (config.recommendations) {
            this.recommendedExtensions = config.recommendations;
        }
    }
}

/**
 * Returns a list of registries with duplicates removed.
 */
function dedupeRegistries(registries: readonly Registry[]) {
    return registries.reduce<Registry[]>((list, item) => {
        if (list.findIndex(other => item.equals(other)) === -1) {
            list.push(item);
        }

        return list;
    }, []);
}
