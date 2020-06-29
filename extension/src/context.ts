import { ExtensionContext } from 'vscode';

export function setContext(ctx: ExtensionContext): void {
    context = ctx;
}

export let context: ExtensionContext;
