// TODO: provite localized JSON schema similar to
// https://github.com/microsoft/vscode/blob/master/src/vs/workbench/contrib/extensions/common/extensionsFileTemplate.ts

export const ExtensionsConfigurationFilePath = '.vscode/extensions.private.json';

export const ExtensionsConfigurationInitialContent = (desc: string[]) => `{
\t// ${desc[0]}
\t// Extension identifier format: \${publisher}.\${name}. Example: vscode.csharp

\t// List of NPM registries containing private extensions.
\t// Each item should have a "name", a "registry" URL.
\t// Optional parameters are "query" to filter which extensions are shown, and
\t// "pagination" to disable pagination for registries that do not support it e.g. Artifactory 6.
\t// See https://www.npmjs.com/package/npm-registry-fetch#fetch-opts for extra
\t// options including authentication.
\t"registries": [
\t],
\t// List of private extensions which should be recommended for ${desc[1]}.
\t"recommendations": [
\t]
}`;
