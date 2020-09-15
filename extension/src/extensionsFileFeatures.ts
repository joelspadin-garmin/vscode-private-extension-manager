import * as jsonc from 'jsonc-parser';
import * as vscode from 'vscode';
import { CompletionItem, Disposable } from 'vscode';
import * as nls from 'vscode-nls/node';

import { RegistryProvider } from './RegistryProvider';

const localize = nls.loadMessageBundle();

const DocumentSelector = {
    language: 'jsonc',
    pattern: '**/extensions.private.json',
    scheme: 'file',
} as vscode.DocumentSelector;

/**
 * Code snippet for defining a new registry.
 */
const RegistrySnippet = `{
\t"name": "My Registry",
\t"registry": "https://registry.url"
}`;

/**
 * Code snippet for defining a new registry with a search query.
 */
const RegistryWithQuerySnippet = `{
\t"name": "My Registry",
\t"registry": "https://registry.url",
\t"query": ["keywords:text"]
}`;

/**
 * Implements language features for extensions.private.json files.
 */
export class ExtensionsFileFeatures implements Disposable, vscode.CompletionItemProvider {
    private disposable: Disposable;

    // Getting extension completion items involves network requests.
    // Cache the results to speed up subsequent queries.
    private _cachedExtensionItems?: CompletionItem[];
    private cacheEvents?: Disposable;

    constructor(private readonly registryProvider: RegistryProvider) {
        this.disposable = Disposable.from(vscode.languages.registerCompletionItemProvider(DocumentSelector, this, '"'));
    }

    public dispose(): void {
        this.disposable.dispose();

        if (this.cacheEvents) {
            this.cacheEvents.dispose();
        }
    }

    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<CompletionItem[]> {
        const location = jsonc.getLocation(document.getText(), document.offsetAt(position));

        if (location.matches(['registries', '*'])) {
            return this.getRegistryCompletionItems();
        }

        if (location.matches(['recommendations', '*'])) {
            return this.getRecommendationsCompletionItems(document, position, token);
        }

        return [];
    }

    private get cachedExtensionItems() {
        return this._cachedExtensionItems;
    }

    private set cachedExtensionItems(value) {
        // After caching extension items, clear the cache if things change.
        if (value && !this.cacheEvents) {
            const clearCache = () => {
                this.cachedExtensionItems = undefined;
            };

            this.cacheEvents = Disposable.from(
                this.registryProvider.onDidChangeRegistries(clearCache),
                vscode.window.onDidChangeActiveTextEditor(clearCache),
            );
        }

        // Remove the event listeners when clearing the cache.
        if (!value && this.cacheEvents) {
            this.cacheEvents.dispose();
            this.cacheEvents = undefined;
        }

        this._cachedExtensionItems = value;
    }

    /**
     * Gets template objects for completion in the "registries" property.
     */
    private getRegistryCompletionItems(): CompletionItem[] {
        const commonProps: Partial<CompletionItem> = {
            kind: vscode.CompletionItemKind.Module,
        };

        const completionItems: CompletionItem[] = [
            {
                preselect: true,
                label: '{name, registry}',
                insertText: RegistrySnippet,
                detail: localize('completion.registry', 'New registry'),
            },
            {
                label: '{name, registry, query}',
                insertText: RegistryWithQuerySnippet,
                detail: localize('completion.registryWithQuery', 'New registry with query'),
            },
        ];

        return completionItems.map((item) => ({ ...commonProps, ...item }));
    }

    /**
     * Gets a list of extension IDs for completion in the "recommendations" property.
     */
    private async getRecommendationsCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<CompletionItem[]> {
        const items = await this.getExtensionCompletionItems(token);
        return updateStringCompletionItems(document, position, items);
    }

    /**
     * Gets a list of completion items that insert extension IDs.
     */
    private async getExtensionCompletionItems(token: vscode.CancellationToken) {
        if (this.cachedExtensionItems) {
            return this.cachedExtensionItems;
        }

        const packages = await this.registryProvider.getUniquePackages();

        const items = packages.map(
            (pkg) =>
                ({
                    label: `"${pkg.extensionId}"`,
                    detail: pkg.displayName,
                    kind: vscode.CompletionItemKind.Text,
                } as CompletionItem),
        );

        if (!token.isCancellationRequested) {
            this.cachedExtensionItems = items;
        }

        return items;
    }
}

/**
 * Updates a `CompletionItem` array where all items insert double-quoted strings
 * such that a completion will overwrite any quotes already surrounding the
 * insertion position.
 * @param document The document in which the command was invoked.
 * @param position The position at which the command was invoked.
 * @param items Completion items to update.
 */
function updateStringCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    items: CompletionItem[],
) {
    const text = document.lineAt(position.line).text;
    const start = text.charAt(position.character - 1) === '"' ? position.translate(0, -1) : position;
    const end = text.charAt(position.character) === '"' ? position.translate(0, 1) : position;

    const range = new vscode.Range(start, end);

    return items.map((item) => ({ ...item, range }));
}
