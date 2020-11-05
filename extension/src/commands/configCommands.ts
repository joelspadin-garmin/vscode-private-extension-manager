import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';

import { Command } from '../commandManager';
import { ExtensionsConfigurationFilePath, ExtensionsConfigurationInitialContent } from '../extensionsFileTemplate';
import { pickWorkspaceFolder } from '../workspace';

/**
 * Opens extensions.private.json to the "registries" element.
 */
export class ConfigureWorkspaceRegistries implements Command {
    public readonly id = 'privateExtensions.configureWorkspaceRegistries';

    public async execute(): Promise<void> {
        await openExtensionsFileToElement('registries');
    }
}

/**
 * Opens extensions.private.json to the "recommendations" element.
 */
export class ConfigureRecommendedExtensions implements Command {
    public readonly id = 'privateExtensions.configureRecommendedExtensions';

    public async execute(): Promise<void> {
        await openExtensionsFileToElement('recommendations');
    }
}

/**
 * Opens extensions.private.json to a given JSON element.
 *
 * If there are multiple workspace folders, the user will be prompted to select one.
 */
async function openExtensionsFileToElement(...path: jsonc.JSONPath) {
    const folder = await pickWorkspaceFolder();

    if (folder) {
        const editor = await openOrCreateExtensionsFile(folder);
        focusJsonElement(editor, path);
    }
}

/**
 * Opens the extensions.private.json file in an editor, creating it if necessary.
 */
async function openOrCreateExtensionsFile(folder: vscode.WorkspaceFolder) {
    const file = Uri.file(path.join(folder.uri.fsPath, ExtensionsConfigurationFilePath));

    const edit = new vscode.WorkspaceEdit();
    edit.createFile(file, { ignoreIfExists: true });
    await vscode.workspace.applyEdit(edit);

    const document = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(document);

    await writeTemplateIfEmpty(editor);

    return editor;
}

/**
 * Writes the extensions.private.json template to the given editor's document if
 * the document is empty.
 */
async function writeTemplateIfEmpty(editor: vscode.TextEditor) {
    if (editor.document.getText().trim() !== '') {
        return;
    }

    await editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(0, 0), ExtensionsConfigurationInitialContent);
    });

    await editor.document.save();
}

/**
 * Places the editor's cursor at a given JSON element.
 *
 * If the element has children, the cursor will be placed after the last child.
 * If the element cannot be found, the cursor is not moved.
 */
function focusJsonElement(editor: vscode.TextEditor, path: jsonc.JSONPath) {
    const tree = jsonc.parseTree(editor.document.getText());
    if (!tree) {
        return;
    }

    const node = jsonc.findNodeAtLocation(tree, path);
    if (!node) {
        return;
    }

    const lastChildNode = node?.children?.[node.children.length - 1];

    const offset = lastChildNode ? lastChildNode.offset + lastChildNode.length : node.offset + 1;
    const position = editor.document.positionAt(offset);

    editor.selections = [new vscode.Selection(position, position)];
}
