import { ExtensionContext } from 'vscode';

export function setContext(ctx: ExtensionContext) {
    context = ctx;
}

export let context: ExtensionContext;
