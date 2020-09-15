import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

const localize = nls.loadMessageBundle();

/**
 * If the workspace contains more than one folder, this prompts the user to
 * select one and returns it. If there is only one folder, this returns it
 * immediately. If there are no folders, this returns `undefined`.
 */
export async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;

    if (!folders?.length) {
        vscode.window.showInformationMessage(localize('no.workspace.folders', 'There are no workspace folders open.'));
        return undefined;
    }

    if (folders.length === 1) {
        return folders[0];
    } else {
        return await vscode.window.showWorkspaceFolderPick();
    }
}
