import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('_privateExtensionManager.remoteHelper.getExtension', (extensionId: string) => {
            const extension = vscode.extensions.getExtension(extensionId);
            if (extension) {
                return {
                    id: extension.id,
                    extensionKind: extension.extensionKind,
                    packageJSON: extension.packageJSON,
                };
            } else {
                return undefined;
            }
        }),
        vscode.commands.registerCommand('_privateExtensionManager.remoteHelper.getPlatform', () => {
            return process.platform;
        }),
        vscode.extensions.onDidChange(() => {
            vscode.commands.executeCommand('_privateExtensionManager.notifyExtensionsChanged');
        }),
    );
}

export function deactivate(): void {
    // Nothing to do.
}
