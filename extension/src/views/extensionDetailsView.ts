import * as t from 'io-ts';
import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable, Uri } from 'vscode';
import * as nls from 'vscode-nls/node';

import { ExtensionInfoService } from '../extensionInfo';
import { Package } from '../Package';
import { getReleaseChannel } from '../releaseChannel';
import { getRemoteName } from '../remote';
import { getNpmDownloadDir, readJSON } from '../util';

import { MarkdownView } from './markdownView';
import { WebView } from './webView';

const localize = nls.loadMessageBundle();

const ExtensionManifest = t.partial({
    name: t.string,
    displayName: t.string,
    description: t.string,
    version: t.string,
    publisher: t.string,
    icon: t.string,
});
type ExtensionManifest = t.TypeOf<typeof ExtensionManifest>;

interface ExtensionData {
    pkg: Package;
    directory: string;
    manifest: ExtensionManifest;
    readme: Uri | null;
    changelog: Uri | null;
}

export class ExtensionDetailsView extends WebView<ExtensionData> {
    private disposable2: Disposable;

    constructor(private readonly extensionInfo: ExtensionInfoService) {
        super(getLocalResourceRoots());

        this.disposable2 = Disposable.from(
            // Refresh on changes to extension details, as the displayed extension
            // may have been installed/uninstalled.
            this.extensionInfo.onDidChange(this.refresh, this),
            // Refresh on changes to release channels, as the channel for the
            // displayed extension may have changed.
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('privateExtensions.channels')) {
                    this.refresh();
                }
            }),
        );
    }

    public dispose(): void {
        super.dispose();
        this.disposable2.dispose();
    }

    public async refresh(): Promise<void> {
        if (this.visible) {
            await this.pkg.updateState();
            await super.refresh();
        }
    }

    public async show(pkg: Package): Promise<void> {
        await pkg.updateState();

        const { manifest, readme, changelog } = await pkg.getContents();

        const title = `Extension: ${pkg.displayName}`;

        const data: ExtensionData = {
            directory: path.dirname(manifest.fsPath),
            manifest: await readManifest(manifest),
            pkg,
            readme,
            changelog,
        };

        await super.internalShow(data, title);
    }

    public get pkg(): Package {
        return this.data.pkg;
    }

    public get directory(): string {
        return this.data.directory;
    }

    public get manifest(): ExtensionManifest {
        return this.data.manifest;
    }

    public get readme(): Uri | null {
        return this.data.readme;
    }

    public get changelog(): Uri | null {
        return this.data.changelog;
    }

    protected async getHead(nonce: string): Promise<string> {
        return `
            ${await super.getHead(nonce)}
            <link rel="stylesheet" href="${this.mediaUri}/workbench.css">
            <link rel="stylesheet" href="${this.mediaUri}/extension.css">
            <link rel="stylesheet" href="${this.mediaUri}/markdown.css">
            <link rel="stylesheet" href="${this.mediaUri}/highlight.css">
            `;
    }

    protected async getBody(nonce: string): Promise<string> {
        const readme = this.readme ? await MarkdownView.render(this.readme) : undefined;
        const changelog = this.changelog ? await MarkdownView.render(this.changelog) : undefined;

        // This matches the structure of VS Code's built-in extensions viewer
        // so we can re-use their style sheet.
        return `
            <div class="monaco-workbench">
            <div class="monaco-editor">
            <div class="extension-editor">
                <div class="header">
                    <div class="icon-container">
                        <img class="icon" draggable="false" src="${this.getIcon()}">
                        <div class="extension-remote-badge-container">
                            ${await this.getRemoteBadge()}
                        </div>
                    </div>
                    <div class="details">
                        <div class="title">
                            <span class="name" title="${localize('extension.name', 'Extension name')}">
                                ${this.pkg.displayName}
                            </span>
                            <span class="identifier" title="${localize(
                                'extension.identifier',
                                'Extension identifier',
                            )}">
                                ${this.pkg.extensionId}
                            </span>
                        </div>
                        <div class="subtitle">
                            <span class="publisher" title="${localize('publisher', 'Publisher')}">
                                ${this.pkg.publisher}
                            </span>
                        </div>
                        <div class="description">
                            ${this.pkg.description}
                        </div>
                        <div class="actions">
                            <div class="monaco-action-bar">
                                <ul class="actions-container" role="toolbar">
                                    ${await this.getActions()}
                                    ${await this.getInstallLocation()}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="body tab-details">
                    <div class="navbar">
                        <div class="monaco-action-bar">
                            <ul class="actions-container" role="toolbar">
                                <li id="tab-details" class="action-item" role="presentation">
                                    <a
                                        class="action-label"
                                        role="button"
                                        tabindex="0"
                                        title="${localize(
                                            'extension.readme',
                                            "Extension details, rendered from the extension's 'README.md' file",
                                        )}"
                                        >
                                        ${localize('details', 'Details')}
                                    </a>
                                </li>
                                <li id="tab-changelog" class="action-item" role="presentation">
                                    <a
                                        class="action-label"
                                        role="button"
                                        tabindex="0"
                                        title="${localize(
                                            'extension.changelog',
                                            "Extension update history, rendered from the extension's 'CHANGELOG.md' file",
                                        )}"
                                        >
                                        ${localize('changelog', 'Changelog')}
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>
                    <div class="content">
                        <div class="page" id="details">
                            ${readme ?? localize('readme.missing', 'No README file found.')}
                        </div>
                        <div class="page" id="changelog" style="display: none;">
                            ${changelog ?? localize('changelog.missing', 'No changelog file found.')}
                        </div>
                    </div>
                </div>
            </div>
            </div>
            </div>
            <script nonce="${nonce}" src="${this.asWebviewUri('dist/assets/extension-details/index.js')}"></script>
            `;
    }

    private getIcon() {
        if (this.manifest.icon) {
            return this.asWebviewUri(path.join(this.directory, this.manifest.icon));
        } else {
            return `${this.mediaUri}/defaultIcon.png`;
        }
    }

    /**
     * Gets an HTML fragment with a list of actions to place in the action bar.
     */
    private async getActions() {
        const actions: string[] = [];

        if (this.pkg.isUpdateAvailable) {
            addActionButton(
                actions,
                'prominent update',
                localize('update.to.version', 'Update to {0}', this.pkg.version.toString()),
                'privateExtensions.extension.update',
                this.pkg.extensionId,
            );
        }

        if (this.pkg.isInstalled) {
            addActionButton(
                actions,
                'uninstall',
                localize('uninstall', 'Uninstall'),
                'privateExtensions.extension.uninstall',
                this.pkg.extensionId,
            );

            if (await packageHasChannels(this.pkg)) {
                // Read from settings instead of the package, as the package's
                // channel will be stale if the user just switched channels.
                const channel = getReleaseChannel(this.pkg.extensionId);
                addActionButton(
                    actions,
                    'channel',
                    localize('extension.channel', 'Channel: {0}', channel),
                    'privateExtensions.extension.switchChannels',
                    this.pkg.extensionId,
                );
            }
        } else {
            await addInstallButton(actions, this.pkg);
        }

        return actions.join('\n');
    }

    /**
     * Gets an HTML fragment that places a "remote" badge over the extension
     * icon when in a remote workspace and the extension is installed on the
     * remote machine.
     */
    private async getRemoteBadge() {
        if (this.pkg.isUiExtension) {
            return '';
        }

        return `
            <div
                class="extension-remote-badge"
                title="${localize('extension.in.remote', 'Extension in {0}', await getRemoteName())}"
                >
                <span class="octicon octicon-remote"></span>
            </div>
            `;
    }

    /**
     * If the extension is installed and we are in a remote workspace, gets an
     * HTML fragment to place into the action bar to indicate whether the
     * extension is installed on the local or remote machine.
     */
    private async getInstallLocation() {
        if (!this.pkg.isInstalled || vscode.env.remoteName === undefined) {
            return '';
        }

        let message: string;
        if (this.pkg.isUiExtension) {
            message = localize('extension.installed.locally', 'Extension is installed locally');
        } else {
            message = localize(
                'extension.installed.in.remote',
                "Extension is installed in '{0}'",
                await getRemoteName(),
            );
        }

        // Match vscode's behavior, which for some reason formats this as a
        // disabled action button.
        return `
            <li class="action-item disabled" role="presentation">
                <a
                    class="action-label codicon disabled disable-status"
                    role="button"
                    aria-disabled"true">
                    ${message}
                </a>
            </li>
            `;
    }
}

/**
 * Adds an item to the list of actions to display in the action bar.
 * @param actions An array of HTML fragments to which the action should be added.
 * @param classList Space-separated list of CSS classes for the action.
 * @param label Text label for the action.
 * @param command Command to execute when the action is clicked.
 * @param args Arguments to pass to the command.
 */
function addActionButton(actions: string[], classList: string, label: string, command: string, args?: any) {
    const params = args === undefined ? '' : `?${encodeURIComponent(JSON.stringify(args))}`;

    actions.push(`
        <li class="action-item" role="presentation">
            <a
                class="action-label codicon extension-action enable ${classList}"
                role="button"
                href="command:${command}${params}"
                >
                ${label}
            </a>
        </li>
        `);
}

/**
 * Adds an item to install an extension to the list of actions to display in the
 * action bar.
 * @param actions An array of HTML fragments to which the action should be added.
 * @param pkg The extension to install.
 */
async function addInstallButton(actions: string[], pkg: Package) {
    let text: string;

    if (vscode.env.remoteName) {
        if (pkg.isUiExtension) {
            text = localize('install.locally', 'Install Locally');
        } else {
            text = localize('install.in.remote', 'Install in {0}', await getRemoteName());
        }
    } else {
        text = localize('install', 'Install');
    }

    addActionButton(actions, 'install prominent', text, 'privateExtensions.extension.install', pkg.extensionId);
}

function getLocalResourceRoots() {
    return [Uri.file(getNpmDownloadDir())];
}

async function readManifest(uri: Uri): Promise<ExtensionManifest> {
    const manifest = await readJSON(uri);

    return ExtensionManifest.is(manifest) ? manifest : {};
}

async function packageHasChannels(pkg: Package) {
    const channels = await pkg.getChannels();
    return Object.keys(channels).length > 1;
}
