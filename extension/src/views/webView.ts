import { isAbsolute } from 'path';
import * as vscode from 'vscode';
import { Disposable, WebviewPanel } from 'vscode';
import * as nls from 'vscode-nls/node';

import { getLogger } from '../logger';
import { getExtensionFileUri, memoize } from '../util';

const localize = nls.loadMessageBundle();

export abstract class WebView<T> implements Disposable {
    private panel?: WebviewPanel;
    private disposable?: Disposable;
    private localResourceRoots: readonly vscode.Uri[];
    private _data?: T;

    constructor(localResourceRoots?: readonly vscode.Uri[]) {
        this.localResourceRoots = localResourceRoots ?? [];
    }

    public get visible(): boolean {
        return this.panel?.visible ?? false;
    }

    public dispose(): void {
        this.disposable?.dispose();
    }

    public async refresh(): Promise<void> {
        if (this.panel) {
            this.panel.webview.html = await this.getHtml();
        }
    }

    protected get data(): T {
        if (this._data === undefined) {
            throw new Error('Data not set');
        }

        return this._data;
    }

    /**
     * Gets the URI of the media directory.
     */
    protected get mediaUri(): vscode.Uri {
        return this.asWebviewUri('media');
    }

    /**
     * Convert a URI for the local file system to one that can be used inside webviews.
     *
     * @param localResource A URI or an absolute or relative file path to convert.
     *      Relative paths are relative to the extension's install directory.
     */
    protected asWebviewUri(localResource: vscode.Uri | string): vscode.Uri {
        if (typeof localResource === 'string') {
            if (isAbsolute(localResource)) {
                localResource = vscode.Uri.file(localResource);
            } else {
                localResource = getExtensionFileUri(localResource);
            }
        }

        if (this.panel) {
            return this.panel.webview.asWebviewUri(localResource);
        } else {
            throw new Error('Panel not open');
        }
    }

    protected async internalShow(data: T, title: string): Promise<void> {
        this._data = data;

        if (this.panel === undefined) {
            this.panel = vscode.window.createWebviewPanel('garminExtensions', title, vscode.ViewColumn.Active, {
                enableCommandUris: true,
                enableScripts: true,
                localResourceRoots: [
                    getExtensionFileUri('dist'),
                    getExtensionFileUri('media'),
                    ...this.localResourceRoots,
                ],
            });

            this.disposable = this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.disposable = undefined;
            });
        }

        this.title = title;
        this.panel.reveal();

        await this.refresh();
    }

    protected get title(): string {
        return this.panel?.title ?? '';
    }

    protected set title(value: string) {
        if (this.panel) {
            this.panel.title = value;
        }
    }

    protected async getHead(nonce: string): Promise<string> {
        const cspSource = this.panel?.webview.cspSource ?? '';

        const policy = [
            `default-src 'none';`,
            `font-src ${cspSource};`,
            `img-src ${cspSource} https:;`,
            `script-src 'nonce-${nonce}';`,
            `style-src ${cspSource} 'unsafe-inline';`,
        ].join('');

        return `
            <meta charset="utf-8">
            <meta http-equiv="Content-Security-Policy" content="${policy}" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            `;
    }

    protected abstract getBody(nonce: string): Promise<string>;

    protected async getHtml(): Promise<string> {
        const nonce = getNonce();

        return `<!doctype html>
            <html lang="en">
            <head>
                ${await this.getHead(nonce)}
            </head>
            <body class="${await this.getUiPlatformClass()}">
                ${await this.getBody(nonce)}
            </body>
            </html>`;
    }

    /**
     * Gets a CSS class representing the platform of the machine running the UI.
     *
     * This is needed to set the correct font and other OS-specific styles.
     */
    @memoize
    private async getUiPlatformClass(): Promise<string> {
        const platform = await getUiPlatform();

        switch (platform) {
            case 'cygwin':
            case 'win32':
                return 'windows';

            case 'darwin':
                return 'mac';

            case 'freebsd':
            case 'linux':
            case 'openbsd':
                return 'linux';

            default:
                return '';
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Gets `process.platform` for the machine running the UI.
 */
async function getUiPlatform(): Promise<NodeJS.Platform> {
    if (vscode.env.remoteName) {
        try {
            const uiPlatform = await vscode.commands.executeCommand<NodeJS.Platform>(
                '_privateExtensionManager.remoteHelper.getPlatform',
            );

            if (uiPlatform) {
                return uiPlatform;
            }
        } catch (ex) {
            getLogger().log(
                localize('warn.remote.helper.fail', 'Warning: Failed to call remote helper:\n{0}', ex.toString()),
            );
        }
    }

    return process.platform;
}
