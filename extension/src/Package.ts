import * as _glob from 'glob';
import * as t from 'io-ts';
import * as os from 'os';
import * as path from 'path';
import { parse as parseVersion, SemVer } from 'semver';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { Registry, VersionInfo } from './Registry';
import { LATEST } from './releaseChannel';
import { assertType, options } from './typeUtil';
import { isNonEmptyArray, formatExtensionId } from './util';

const README_GLOB = 'README?(.*)';
const CHANGELOG_GLOB = 'CHANGELOG?(.*)';

const glob = promisify(_glob);
const localize = nls.loadMessageBundle();

export enum PackageState {
    /** The extension is available to be installed. */
    Available = 'available',
    /** The latest version of the extension is already installed in the local machine. */
    Installed = 'installed',
    /** The latest version of the extension is already installed in the remote machine. */
    InstalledRemote = 'installed.remote',
    /** The latest version of the extension is installed from a pre-release channel. */
    InstalledPrerelease = 'installed.prerelease',
    /** The extension is installed and a newer version is available. */
    UpdateAvailable = 'update',
    /** The package is not a valid extension. */
    Invalid = 'invalid',
}

/**
 * Error thrown when constructing a `Package` from a package manifest that is
 * not a Visual Studio Code extension.
 */
export class NotAnExtensionError extends Error {}

/**
 * Represents a result containing a value.
 */
type ResultSuccess<T> = { type: 'success'; value: T };

/**
 * Represents a result containing an error.
 */
type ResultError = { type: 'error'; error: Error };

/**
 * Type that contains a value if successful or an error otherwise.
 */
type Result<T> = ResultSuccess<T> | ResultError;

function valueOrNull<T>(result: Result<T>): T | null {
    return result.type === 'success' ? result.value : null;
}

function success<T>(value: T): ResultSuccess<T> {
    return { type: 'success', value: value };
}

function error(message: string): ResultError {
    return { type: 'error', error: new Error(message) };
}

/**
 * Fields expected for all NPM packages.
 */
const PackageManifest = options(
    {
        name: t.string,
    },
    {
        displayName: t.string,
        publisher: t.string,
        description: t.string,
        version: t.string,
        files: t.array(t.string),
        osSpecificVsix: t.record(t.string, t.string),
    },
);
type PackageManifest = t.TypeOf<typeof PackageManifest>;

/**
 * Fields required for VS Code extensions.
 */
const VSCodeExtensionFields = t.type({
    engines: t.type({
        vscode: t.string,
    }),
});
type VSCodeExtensionFields = t.TypeOf<typeof VSCodeExtensionFields>;

/**
 * Represents an NPM package for an extension.
 */
export class Package {
    /**
     * Comparison function to sort packages by name in alphabetical order.
     */
    public static compare(a: Package, b: Package): number {
        const nameA = a.displayName.toUpperCase();
        const nameB = b.displayName.toUpperCase();

        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    }

    /** The package name. */
    public readonly name: string;
    /** The name of the package's publisher */
    public readonly publisher: string;
    /** The ID of the extension in the form `publisher.name`. */
    public readonly extensionId: string;
    /** The name to display for the package in the UI. */
    public readonly displayName: string;
    /** A short description for the package. */
    public readonly description: string;
    /** The package version. */
    public readonly version: SemVer;
    /** The registry containing the extension. */
    public readonly registry: Registry;
    /* The channel that this package is tracking */
    public readonly channel: string;

    private readonly _vsixFile: Result<string>;
    private readonly isPublisherValid: boolean;

    private _isInstalled = false;
    private _isUiExtension = false;
    private _installedVersion: SemVer | null = null;
    private _installedExtensionKind: vscode.ExtensionKind | undefined;

    /**
     * @param registry The `Registry` that contains the package.
     * @param manifest The version-specific package manifest for the extension.
     * @param channel The NPM dist-tag this package is tracking, or a specific version it is pinned to.
     * @throws {NotAnExtensionError} `manifest` is not a Visual Studio Code extension.
     */
    constructor(registry: Registry, manifest: Record<string, unknown>, channel = LATEST) {
        this.registry = registry;

        assertType(manifest, PackageManifest);

        assertType(
            manifest,
            VSCodeExtensionFields,
            localize('package.not.an.extension', 'Package {0} is not an extension', manifest.name),
            NotAnExtensionError,
        );

        this.name = manifest.name;
        this.channel = channel;
        this.displayName = manifest.displayName ?? this.name;

        // VS Code uses case-insensitive comparison to match extension IDs.
        // Match that behavior by normalizing everything to lowercase.
        this.isPublisherValid = !!manifest.publisher;
        this.publisher = manifest.publisher ?? localize('publisher.unknown', 'Unknown');
        this.extensionId = formatExtensionId(this.publisher, this.name);

        this.description = manifest.description ?? this.name;
        this.version = parseVersion(manifest.version) ?? new SemVer('0.0.0');

        // Attempt to infer from the manifest where the extension will be
        // installed. This is overridden by the actual install location later
        // if the extension is already installed.
        this._isUiExtension = isUiExtension(this.extensionId, manifest);

        this._vsixFile = findVsixFile(manifest);
    }

    /**
     * Checks if the extension is installed, and updates the state to match the
     * installed version.
     */
    public async updateState(): Promise<void> {
        const extension = await this.registry.extensionInfo.getExtension(this.extensionId);
        if (extension) {
            this._isInstalled = true;
            this._installedExtensionKind = extension.extensionKind;
            this._installedVersion = extension.version;
        } else {
            this._isInstalled = false;
            this._installedExtensionKind = undefined;
            this._installedVersion = null;
        }
    }

    /**
     * A value that represents the state of the extension.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get state(): PackageState {
        if (this.isPublisherValid && this.vsixFile) {
            if (this.isUpdateAvailable) {
                return PackageState.UpdateAvailable;
            }

            if (this.isInstalled) {
                if (this.channel !== LATEST) {
                    return PackageState.InstalledPrerelease;
                }

                return this.isUiExtension ? PackageState.Installed : PackageState.InstalledRemote;
            }

            return PackageState.Available;
        }

        return PackageState.Invalid;
    }

    /**
     * The NPM package specifier for the package.
     */
    public get spec(): string {
        return `${this.name}@${this.version}`;
    }

    /**
     * If `state` is `PackageState.Invalid`, gets a string explaining why the
     * package is invalid.
     */
    public get errorMessage(): string {
        if (!this.isPublisherValid) {
            return localize('manifest.missing.publisher', 'Manifest is missing "publisher" field.');
        }
        if (this._vsixFile.type === 'error') {
            return this._vsixFile.error.message;
        }
        return '';
    }

    /**
     * Is the extension installed?
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get isInstalled(): boolean {
        return this._isInstalled;
    }

    /**
     * If `isInstalled`, the version of extension that is installed, or `null` otherwise.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get installedVersion(): SemVer | null {
        return this._installedVersion;
    }

    /**
     * If `true`, this extension runs on the same machine where the UI runs.
     * If `false`, it runs where the remote extension host runs.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get isUiExtension(): boolean {
        if (this._installedExtensionKind !== undefined) {
            return this._installedExtensionKind === vscode.ExtensionKind.UI;
        } else {
            return this._isUiExtension;
        }
    }

    /**
     * Gets whether this package represents a newer version of the extension
     * than the version that is installed.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get isUpdateAvailable(): boolean {
        return !!this.installedVersion && this.version > this.installedVersion;
    }

    /**
     * Gets the .vsix file or `null`, if the package doesn't contain a
     * suitable file.
     */
    public get vsixFile(): string | null {
        return valueOrNull(this._vsixFile);
    }

    public toString(): string {
        return this.displayName;
    }

    /**
     * Downloads the package and returns the locations of its package manifest,
     * readme, changelog, and .vsix file.
     */
    public async getContents(): Promise<{
        manifest: vscode.Uri;
        vsix: vscode.Uri | null;
        readme: vscode.Uri | null;
        changelog: vscode.Uri | null;
    }> {
        const directory = await this.registry.downloadPackage(this);
        const vsix = this.vsixFile;

        return {
            manifest: uriJoin(directory, 'package.json'),
            vsix: vsix ? uriJoin(directory, vsix) : null,
            readme: await findFile(directory, README_GLOB),
            changelog: await findFile(directory, CHANGELOG_GLOB),
        };
    }

    /**
     * Gets the release channels available for the package.
     */
    public getChannels(): Promise<Record<string, VersionInfo>> {
        return this.registry.getPackageChannels(this.name);
    }
}

function uriJoin(directory: vscode.Uri, file: string) {
    return vscode.Uri.file(path.join(directory.fsPath, file));
}

function findVsixFile(manifest: PackageManifest): Result<string> {
    if (manifest.files) {
        if (manifest.osSpecificVsix) {
            const vsix = manifest.osSpecificVsix[os.platform()] ?? manifest.osSpecificVsix['default'];

            if (vsix) {
                return success(vsix);
            }

            return error(
                localize(
                    'manifest.missing.os.vsix',
                    'Manifest is missing .vsix file in "osSpecificVsix" field for "{0}".',
                    os.platform(),
                ),
            );
        }

        for (const file of manifest.files) {
            if (typeof file === 'string' && file.endsWith('.vsix')) {
                return success(file);
            }
        }
    }

    return error(localize('manifest.missing.vsix', 'Manifest is missing .vsix file in "files" field.'));
}

/**
 * Searches for a file in a directory using a glob pattern.
 *
 * Returns the first file found, or null if no file was found.
 */
async function findFile(directory: vscode.Uri, pattern: string) {
    const results = await glob(pattern, {
        cwd: directory.fsPath,
        nocase: true,
    });

    if (results.length > 0) {
        const file = path.join(directory.fsPath, results[0]);
        return vscode.Uri.file(file);
    } else {
        return null;
    }
}

// Mirrors https://github.com/microsoft/vscode/blob/master/src/vs/workbench/services/extensions/common/extensionsUtil.ts
function isUiExtension(extensionId: string, manifest: any) {
    // All extensions are UI extensions when not using remote development.
    if (vscode.env.remoteName === undefined) {
        return true;
    }

    return getExtensionKind(extensionId, manifest).includes('ui');
}

function getExtensionKind(extensionId: string, manifest: any): string[] {
    // remote.extensionKind setting overrides manifest:
    // https://code.visualstudio.com/docs/remote/ssh#_advanced-forcing-an-extension-to-run-locally-remotely
    let result = getConfiguredExtensionKind(extensionId);
    if (typeof result !== 'undefined') {
        return toArray(result);
    }

    // Check the manifest
    result = manifest.extensionKind;
    if (typeof result !== 'undefined') {
        return toArray(result);
    }

    // Not a UI extension if it has main
    if (manifest.main) {
        return ['workspace'];
    }

    // Not a UI extension if it has dependencies or an extension pack.
    if (isNonEmptyArray(manifest.extensionDependencies) || isNonEmptyArray(manifest.extensionPack)) {
        return ['works[ace'];
    }

    if (manifest.contributes) {
        // TODO: Not a UI extension if it has no UI contributions.
        // (but vscode has no API to check what is a UI contribution.)
    }

    return ['ui', 'workspace'];
}

function getConfiguredExtensionKind(extensionId: string) {
    const config = vscode.workspace
        .getConfiguration()
        .get<Record<string, string | string[]>>('remote.extensionKind', {});

    for (const id of Object.keys(config)) {
        if (id.toLowerCase() === extensionId) {
            return config[id];
        }
    }

    return undefined;
}

function toArray(extensionKind: string | string[]): string[] {
    if (Array.isArray(extensionKind)) {
        return extensionKind;
    }

    return extensionKind === 'ui' ? ['ui', 'workspace'] : [extensionKind];
}
