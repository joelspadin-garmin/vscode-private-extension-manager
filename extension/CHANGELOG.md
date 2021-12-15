# Change Log

## 1.8.0

-   Fixed incorrect extension version comparisons. Thanks, [denielig](https://github.com/denielig)!
-   Added a `privateExtensions.autoUpdate` setting which will make extensions update automatically without prompting first.
    Thanks, [colas31](https://github.com/colas31)!
-   Other extensions can now pass `{silent: true}` as a second parameter to the `privateExtensions.extension.install`
    command to silently install a private extension. Also provided by colas31.

## 1.7.0

-   Relaxed package type checking for JFrog Artifactory (fixes [#50](https://github.com/joelspadin-garmin/vscode-private-extension-manager/issues/50)).
    Thanks, [matspi](https://github.com/matspi)!
-   Added the extension version number to the extension details view. Thanks, [offa](https://github.com/offa)!

## 1.6.0

-   Added a `privateExtensions.allowInsecureContent` setting to opt in to allowing non-HTTPS content from extension README files.
    Thanks, [r-hadrich](https://github.com/r-hadrich)!

## 1.5.0

-   Added support for [OS-specific extension packages](https://github.com/joelspadin-garmin/vscode-private-extension-manager/tree/master/extension#os-specific-extensions).
    Thanks, [offa](https://github.com/offa)!

## 1.4.1

-   Reverted libnpmsearch too, as that was still pulling in the new version of npm-registry-fetch.

## 1.4.0

-   Added support for web versions of VS Code. Thanks, [lachaib](https://github.com/lachaib)!
-   Reverted npm-registry-fetch yet again, as we found more problems with the new version.

## 1.3.0

-   Renamed **Private Extensions: Clean NPM Cache** to **Private Extensions: Garbage Collect NPM Cache**.
-   Added a **Private Extensions: Delete NPM Cache** command to completely delete the cache.
-   Upgraded [npm-registry-fetch](https://github.com/npm/npm-registry-fetch#-fetch-options) again
    now that the issues with it are fixed.
-   Changed recommended extensions to not be hidden when installed. Fixed "no recommended extensions found"
    message when there are recommended extensions, but they are all installed.

## 1.2.0

-   Temporarily reverted npm-registry-fetch to the previous version, as it wasn't working with some registries.
-   Added welcome views for when no registries are configured.
-   Cache cleaning slowed startup down too much and is no longer automatic. It can
    now be run manually with the **Private Extensions: Clean NPM Cache** command.

## 1.1.0

-   **Breaking change**: [npm-registry-fetch](https://github.com/npm/npm-registry-fetch#-fetch-options)
    has removed several option aliases. If you use any registry options other than
    `name`, `registry`, and `query`, double check your option names.
-   Added `enablePagination` option to work around servers that don't properly handle pagination options.
-   A warning is now shown if a server returns too many results instead of continuing to make requests forever.
-   NPM cache is now cleaned to free up disk space that's no longer needed.

## 1.0.0

-   Changes for marketplace release
-   Added support for tracking channels
-   Fixed sort order for "Install Another Version" command
-   Updated theme to match VS Code version 1.42

## 0.9.0-beta.0

-   Initial release
