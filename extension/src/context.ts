import { ExtensionContext } from 'vscode';

export function setContext(ctx: ExtensionContext) {
    context = ctx;
}

export var context: ExtensionContext;
