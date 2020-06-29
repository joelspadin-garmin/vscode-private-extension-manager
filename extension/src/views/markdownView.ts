import * as path from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';

import { WebView } from './webView';

export class MarkdownView extends WebView<Uri> {
    /**
     * Renders the given Markdown file or string as HTML.
     * @param uriOrMarkdown The URI of a file to render, or a Markdown string to render.
     */
    public static async render(uriOrMarkdown: Uri | string): Promise<string> {
        let document: string | vscode.TextDocument;

        if (uriOrMarkdown instanceof Uri) {
            document = await vscode.workspace.openTextDocument(uriOrMarkdown);
        } else {
            document = uriOrMarkdown;
        }

        return (await vscode.commands.executeCommand('markdown.api.render', document)) as string;
    }

    public async show(file: Uri, title?: string): Promise<void> {
        title = title ?? path.basename(file.fsPath);

        await super.internalShow(file, title);
    }

    public get file(): Uri {
        return this.data;
    }

    protected async getHead(nonce: string): Promise<string> {
        return `
            ${await super.getHead(nonce)}
            <link rel="stylesheet" href="${this.mediaUri}/markdown.css">
            `;
    }

    protected async getBody(): Promise<string> {
        return await MarkdownView.render(this.file);
    }
}
