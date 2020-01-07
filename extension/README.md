# Private Extension Manager

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Private Extension Manager lets you find, install, and update extensions from any
NPM registry. This lets you distribute organization-specific extensions using a
private registry server such as [Sonatype Nexus](https://www.sonatype.com/product-nexus-repository)
or [Verdaccio](https://verdaccio.org).

# Managing Extensions

Select the **Private Extensions** icon on the activity bar:

![Activity Bar Icon](https://raw.githubusercontent.com/joelspadin-garmin/vscode-private-extension-manager/master/extension/media/readme/activity-bar.png)

This works similarly to Visual Studio Code's built-in extensions manager and
allows you to install, update, and uninstall private extensions.

By default, the view will be empty. You will need to publish extensions to your
private registry and tell the extension manager how to find the registry before
you can use it.

# Setup

## Publishing Extensions

To allow Private Extension Manager to find your extension,
[package it in the VSIX format using vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension),
create an NPM package containing the .vsix file, and publish it to an NPM
registry. Your extension's `package.json` must contain a `files` array with the
path to the .vsix file so the extension manager knows what to install. Use
`vsce package` in a [`prepublishOnly` script](https://docs.npmjs.com/misc/scripts)
to ensure that your NPM packages always contain an up-to-date extension package.

Note that when Private Extension Manager displays the details for an extension,
it will unpack the latest version of the NPM package to read its README and
CHANGELOG files, but it will not unpack the .vsix file. If your extension has an
icon, ensure that it is either accessible via HTTPS or included directly in your
NPM package by referencing it in the `package.json`'s `files` array.

Visual Studio Code does not support scoped extension names such as
`@my-org/my-extension`. It is recommended that you create a registry that only
contains Visual Studio Code extensions to avoid name collisions. If you need to
publish to a registry that contains packages that are not Visual Studio Code
extensions, add a `keywords` field to your `package.json` and tag all your
extensions with the same keyword so you can filter to just extensions, or ensure
that all non-extension packages are scoped.

Use `publishConfig` to set the registry to which the extension should be
published. You may also need to authenticate with this registry using
`npm login --registry=<url>`. Use `npm publish .` to publish your extension
(not `vsce publish`, as that publishes to the public extensions gallery).

Your `package.json` should look like a regular
[extension manifest](https://code.visualstudio.com/api/references/extension-manifest)
but with extra `files` and `publishConfig` fields and a `prepublishOnly` script
to handle the NPM-specific behavior:

```JSON
{
    "name": "example-extension",
    "displayName": "Example Extension",
    "description": "This is an example extension.",
    "version": "1.2.3",
    "author": {
        "name": "John Doe",
        "email": "John.Doe@garmin.com"
    },
    "publisher": "garmin",
    "engines": {
        "vscode": "^1.40.0"
    },
    "icon": "media/icon.png",
    "files": [
        "extension.vsix",
        "media/icon.png"
    ],
    "publishConfig": {
        "registry": "https://my-private.registry"
    },
    "scripts": {
        "prepublishOnly": "vsce package -o extension.vsix",
        ...
    },
    "devDependencies": {
        "vsce": "^1.69.0",
        ...
    }
    ...
}
```

## Discovering Extensions

Now that your extensions are published to an NPM registry, you need to tell
Private Extension Manager how to find them. This can be done using a workspace
config file and/or a user setting.

### Workspace Configuration

Private Extension Manager uses a config file similar to Visual Studio Code's
`extensions.json` to allow workspaces to recommend extensions. Create a file
named `.vscode/extensions.private.json` in any workspace folder to define your
private extension registries and any recommended extensions. You can use the
**Private Extensions: Configure Recommended Extensions** or
**Private Extensions: Configure Workspace Registries** commands to open this
file, creating it from a template if it does not already exist.

The file has the following structure:

```JSON
{
    "registries": [
        {
            "name": "My Private Registry",
            "registry": "https://my-private.registry",
        }
    ],
    "recommendations": [
        "garmin.example-extension"
    ]
}
```

The `registries` array defines one or more NPM registries to search for private
extensions. Each item supports the following fields:

* **name**: Name to display for the registry.
* **registry**: (Optional) The address of the NPM registry which contains the extension packages.
    If omitted, the registry is determined according to standard [NPM config files](https://docs.npmjs.com/files/npmrc).
* **query**: (Optional) Display only packages that match this [search query](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#get-v1search).
    This is either an array of search terms or a string with space-delimited terms.
    For example, `"keywords:group1 keywords:group2"` would display only packages
    that have the either of the keywords `group1` or `group2`.
* Any options supported by [npm-registry-fetch](https://github.com/npm/npm-registry-fetch#-fetch-options).
    Use these if you need to set authentication, a proxy, or other options.

The `recommendations` array is an optional list of private extensions from any
of the registries which should be recommended for users of the workspace.
The identifier of an extension is always `"${publisher}.${name}"`.
For example: `"garmin.private-extension-manager"`.

You may have multiple workspace folders that contain an `extensions.private.json`
file. The extension manager will display the registries and recommendations from
all of them.

### User Configuration

Each user may also specify registries to use regardless of which workspace is
open with the `privateExtensions.registries` setting. This has the same format
as the `registries` array in `extensions.private.json`.

You can use the **Private Extensions: Add Registry...** and
**Private Extensions: Remove Registry** commands to quickly edit this setting.

#### Custom Channels
It is possible to create tracking channels by using npm dist-tags when
publishing a private extension. The tracked channel is used to determine when
extension updates are available.

*Tracking a Channel*<br>
To specify a channel to track for an extension, add it to the `privateExtensions.channels` settings object as shown in the example below:
```
"privateExtensions.channels" :{
    "publisherOne.extensionOne": "insiders",     // Tracks the 'insiders' dist-tag
    "publisherTwo.extensionOne": "beta",         // Tracks the 'beta' dist-tag
    "publisherOne.extensionTwo": "1.0.0"       // Pins the extension to version 1.0.0
}
```
Note that the key is the extension's npm package ID (`publisherName.packageID`) and the value is the desired channel.

*Publishing to a Channel*<br>
To publish an extension to a channel, simply specify the channel name using
[npm dist-tags](https://docs.npmjs.com/cli/dist-tag) when publishing.  By default, all packages will reference the `latest` tag.
```
npm publish . --tag=insiders
```
When publishing pre-release versions, it is reccomended to use pre-release sematic-versioning, such as **1.0.0-beta.0**.

## Remote Development

When using a [remote development](https://code.visualstudio.com/docs/remote/remote-overview)
extension such as [Remote-SSH](https://code.visualstudio.com/docs/remote/ssh),
install the [Private Extension Manager: Remote Helper](https://marketplace.visualstudio.com/items?itemName=Garmin.private-extension-manager-remote-helper)
extension to give Private Extension Manager access to the local machine.

Private Extension Manager will attempt to infer where VS Code will install an
extension. If it shows "Install Locally" for a workspace extension or vice versa,
[set the `extensionKind` property](https://code.visualstudio.com/api/advanced-topics/remote-extensions#incorrect-execution-location)
in your extension's `package.json` to tell both VS Code and Private Extension
Manager where the extension should be installed.
