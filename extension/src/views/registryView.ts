import * as vscode from 'vscode';
import { Disposable, EventEmitter, TreeDataProvider, TreeItem } from 'vscode';
import * as nls from 'vscode-nls/node';

import { ExtensionInfoService } from '../extensionInfo';
import { Package, PackageState } from '../Package';
import { Registry } from '../Registry';
import { RegistryProvider } from '../RegistryProvider';

import { ExtensionDetailsView } from './extensionDetailsView';

const localize = nls.loadMessageBundle();

const NO_EXTENSIONS_MESSAGE = localize('no.extensions.found', 'No extensions found.');

// TODO: should we build the tree of registries and extensions separately from
// the tree data providers to make it easier to check for updates without
// needing panel view code?

type Icon = TreeItem['iconPath'];

const EXTENSION_ICONS: Record<PackageState, Icon> = {
    [PackageState.Available]: undefined,
    [PackageState.Installed]: new vscode.ThemeIcon('check'),
    [PackageState.InstalledRemote]: new vscode.ThemeIcon('remote'),
    [PackageState.InstalledPrerelease]: new vscode.ThemeIcon('rocket'),
    [PackageState.Invalid]: new vscode.ThemeIcon('warning'),
    [PackageState.UpdateAvailable]: new vscode.ThemeIcon('arrow-down'),
};

/**
 * Top-level controller for the Private Extensions panel.
 */
export class RegistryView implements Disposable {
    private disposable: Disposable;
    private extensionsProvider: ExtensionsProvider;
    private recommendedProvider: RecommendedProvider;
    private extensionView: ExtensionDetailsView;

    constructor(
        protected readonly registryProvider: RegistryProvider,
        private readonly extensionInfo: ExtensionInfoService,
    ) {
        this.extensionsProvider = new ExtensionsProvider(registryProvider);
        const extensionsTree = vscode.window.createTreeView('privateExtensions.extensions', {
            treeDataProvider: this.extensionsProvider,
            showCollapseAll: true,
        });

        this.recommendedProvider = new RecommendedProvider(registryProvider);
        const recommendedTree = vscode.window.createTreeView('privateExtensions.recommended', {
            treeDataProvider: this.recommendedProvider,
        });

        this.extensionView = new ExtensionDetailsView(this.extensionInfo);

        this.disposable = Disposable.from(
            extensionsTree,
            recommendedTree,
            this.extensionsProvider,
            this.recommendedProvider,
            this.extensionView,
        );

        setImmediate(() => this.refresh());
    }

    public dispose(): void {
        this.disposable.dispose();
    }

    /**
     * Reloads the tree views and the extension details view if it is open.
     */
    public refresh(): void {
        // Refreshing the registry provider will trigger all tree views to update.
        this.registryProvider.refresh();

        if (this.extensionView.visible) {
            this.extensionView.refresh();
        }
    }

    public async showExtension(pkg: Package): Promise<void> {
        await this.extensionView.show(pkg);
    }
}

type Element = Registry | Package | string;

/**
 * TreeDataProvider for the Extensions section of the sidebar panel.
 */
class ExtensionsProvider implements TreeDataProvider<Element>, Disposable {
    private _onDidChangeTreeData = new EventEmitter<Element | undefined>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    protected disposable: Disposable;

    private children?: Registry[];

    constructor(protected readonly registryProvider: RegistryProvider) {
        this.disposable = Disposable.from(
            this._onDidChangeTreeData,
            this.registryProvider.onDidChangeRegistries(() => this.refresh()),
            vscode.extensions.onDidChange(() => this.refresh()),
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    public getTreeItem(element: Element): BaseItem {
        return elementToNode(element);
    }

    public getChildren(element?: Element): vscode.ProviderResult<Element[]> {
        if (element) {
            return this.getTreeItem(element).getChildren();
        } else {
            return this.getRootChildren();
        }
    }

    public refresh() {
        this.children = undefined;
        this._onDidChangeTreeData.fire(undefined);
    }

    public getRegistries() {
        if (this.children === undefined) {
            this.children = this.registryProvider.getRegistries();
            this.children.sort(Registry.compare);
        }

        return this.children;
    }

    private async getRootChildren(): Promise<Element[] | null> {
        const children = this.getRegistries();

        if (children.length === 0) {
            return null;
        }

        if (children.length === 1) {
            // If there is only one registry, just show a flat list of its
            // extensions.
            return await this.getTreeItem(children[0]).getChildren();
        }

        return children;
    }
}

/**
 * TreeDataProvider for the recommended extensions section of the sidebar panel.
 *
 * This takes the data from an ExtensionsProvider, filters it to just the
 * extensions recommended by current workspace folders, and displays them
 * without any registry heirarchy.
 */
class RecommendedProvider implements TreeDataProvider<Element>, Disposable {
    private _onDidChangeTreeData = new EventEmitter<Element | undefined>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private disposable: Disposable;

    constructor(private readonly registryProvider: RegistryProvider) {
        this.disposable = Disposable.from(
            this._onDidChangeTreeData,
            this.registryProvider.onDidChangeRegistries(() => this.refresh()),
            vscode.extensions.onDidChange(() => this.refresh()),
        );
    }

    dispose() {
        this.disposable.dispose();
    }

    public getTreeItem(element: Element): BaseItem {
        return elementToNode(element);
    }

    public getChildren(element?: Element): vscode.ProviderResult<Element[]> {
        if (element) {
            return this.getTreeItem(element).getChildren();
        } else {
            return this.getRootChildren();
        }
    }

    public refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }

    protected async getRecommendedExtensions() {
        const recommendedExtensions = this.registryProvider.getRecommendedExtensions();
        const extensions: Package[] = [];

        for (const pkg of await this.registryProvider.getUniquePackages()) {
            if (recommendedExtensions.has(pkg.extensionId)) {
                extensions.push(pkg);
            }
        }

        return extensions;
    }

    private async getRootChildren(): Promise<Element[] | null> {
        const extensions = await this.getRecommendedExtensions();

        if (extensions.length > 0) {
            return extensions;
        } else {
            return null;
        }
    }
}

class BaseItem extends TreeItem {
    public async getChildren(): Promise<Element[] | null> {
        return null;
    }
}

class MessageItem extends BaseItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
    }
}

class RegistryItem extends BaseItem {
    constructor(public readonly registry: Registry) {
        super(registry.name, vscode.TreeItemCollapsibleState.Expanded);

        this.contextValue = `registry.${this.registry.source}`;
        this.resourceUri = this.registry.uri;
    }

    public async getExtensions() {
        const children = await this.registry.getPackages();
        children.sort(Package.compare);
        return children;
    }

    public async getChildren(): Promise<Element[]> {
        const children = await this.getExtensions();

        if (children.length > 0) {
            return children;
        } else {
            return [NO_EXTENSIONS_MESSAGE];
        }
    }
}

class ExtensionItem extends BaseItem {
    constructor(public readonly pkg: Package) {
        super(pkg.displayName, vscode.TreeItemCollapsibleState.None);

        this.command = {
            command: 'privateExtensions.extension.show',
            title: localize('show.extension', 'Show Extension'),
            arguments: [this.pkg],
        };

        this.contextValue = `extension.${this.pkg.state}`;
        this.description = this.getDescription();
        this.iconPath = EXTENSION_ICONS[this.pkg.state];
        this.tooltip = this.getTooltip();
    }

    private getDescription() {
        if (this.pkg.isUpdateAvailable && this.pkg.installedVersion) {
            return `${this.pkg.installedVersion} → ${this.pkg.version}`;
        } else {
            return this.pkg.version.toString();
        }
    }

    private getTooltip() {
        if (this.pkg.state === PackageState.Invalid) {
            return this.pkg.errorMessage;
        } else {
            return this.pkg.description;
        }
    }
}

function elementToNode(element: Element): BaseItem {
    if (element instanceof Registry) {
        return new RegistryItem(element);
    }
    if (element instanceof Package) {
        return new ExtensionItem(element);
    }
    if (typeof element === 'string') {
        return new MessageItem(element);
    }

    throw new Error('Unexpected object: ' + element);
}
