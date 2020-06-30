# Private Extension Manager for Visual Studio Code

![build status: extension](https://github.com/joelspadin-garmin/vscode-private-extension-manager/workflows/Node%20CI%20(extension)/badge.svg)
![build status: remote-helper](https://github.com/joelspadin-garmin/vscode-private-extension-manager/workflows/Node%20CI%20(remote-helper)/badge.svg)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Private Extension Manager is a Visual Studio Code extension that lets you find,
install, and update extensions from any NPM registry. This lets you distribute
organization-specific extensions using a private registry server such as
[Sonatype Nexus](https://www.sonatype.com/product-nexus-repository) or
[Verdaccio](https://verdaccio.org).

The `extension` folder contains the main extension.
See its [README](extension/README.md) for more details.

The `remote-helper` folder contains a helper extension that lets the main
extension work properly when in a remote workspace.

# Contribution

Contributions are welcome! Fork this repository, then see below for instructions
on building and testing the extension. Submit a pull request with the change and
we will review it.

# Building and Debugging

See the [VS Code extension documentation](https://code.visualstudio.com/api) for
general information on developing extensions.

## Prerequisites

1. [Node.js](https://nodejs.org/) 12.x
2. [Visual Studio Code](https://code.visualstudio.com/)

## Setup

1. Clone the repository and open the `private-extension-manager.code-workspace`
workspace in VS Code.
2. When prompted, install all the recommended extensions. If no prompt appears,
press `Ctrl+Shift+P` and run the `Extensions: Show Recommended Extensions`
command, then install the extensions under the **Workspace Recommendations**
section.
3. Press `Ctrl+Shift+P` and run the `Terminal: Create New Integrated Terminal`
command. Select the `extension` folder.
4. Run the following command in the terminal to install all dependencies:
```sh
npm install
```
5. Repeat steps 3-4 for the `remote-helper` folder.

## Debugging

Open the Debug panel (`Ctrl+Shift+D`) and select the debug configuration to run:

* **Run Extension (extension)**: build the main extension and run it in an
experimental instance of VS Code.
* **Extension Tests (extension)**: run unit tests for the main extension.
* **Run Extension (remote-helper)**: build the remote helper extension and run it
in an experimental instance of VS Code.
* **Extension Tests (remote-helper)**: run unit tests for the remote helper
extension.

Press `F5` or click the green triangle button to start debugging.

## Remote Development

To debug Private Extension Manager when using a remote extension such as
[Remote - SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh),
open a VS Code window to the remote machine, then perform the setup as described
above. When you start debugging the extension, this will open another remote
window with the debug extension loaded.
