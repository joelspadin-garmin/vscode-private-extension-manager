// TODO: provite localized JSON schema similar to
// https://github.com/microsoft/vscode/blob/master/src/vs/workbench/contrib/extensions/common/extensionsFileTemplate.ts

export const ExtensionsConfigurationFilePath = '.vscode/extensions.private.json';

export const ExtensionsConfigurationInitialContent = `{
\t// This file configures the private extension manager for users of this workspace.
\t// Extension identifier format: \${publisher}.\${name}. Example: vscode.csharp

\t// List of NPM registries containing private extensions.
\t// Each item should have a "name", a "registry" URL, and optionally a "query" to
\t// filter which extensions are shown.
\t// See https://www.npmjs.com/package/npm-registry-fetch#fetch-opts for extra
\t// options including authentication.
\t"registries": [
\t],
\t// List of private extensions which should be recommended for users of this workspace.
\t"recommendations": [
\t]
}`;
