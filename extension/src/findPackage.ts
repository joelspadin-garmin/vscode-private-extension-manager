import * as nls from 'vscode-nls/node';

import { Package } from './Package';
import { Registry, VersionInfo } from './Registry';
import { RegistryProvider } from './RegistryProvider';

const localize = nls.loadMessageBundle();

/**
 * Finds a package the given extension ID, searching one or more registries
 * @param registry The registry containing the extension package, or a registry provider to search.
 * @param extensionId The extension ID of the package to find.
 * @param version Version or dist-tag such as "1.0.0" to find a specific version of the extension.
 *              If omitted, returns the latest version for the user's selected release channel.
 */
export async function findPackage(
    registry: Registry | RegistryProvider,
    extensionId: string,
    version?: string,
): Promise<Package> {
    const registries = getRegistries(registry);
    const name = stripPublisher(extensionId);

    return await _findPackage(registries, name, version);
}

/**
 * Gets the list of all available versions of an extension, searching one or more registries.
 * @param registry The registry containing the extension package, or a registry provider to search.
 * @param extensionId The extension ID of the package to find.
 */
export async function getPackageVersions(
    registry: Registry | RegistryProvider,
    extensionId: string,
): Promise<VersionInfo[]> {
    const registries = getRegistries(registry);
    const name = stripPublisher(extensionId);

    return await _findVersions(registries, name);
}

/**
 * Gets the list of all available release channels of an extension, searching one or more registries.
 * @param registry The registry containing the extension package, or a registry provider to search.
 * @param extensionId The extension ID of the package to find.
 */
export async function getPackageChannels(
    registry: Registry | RegistryProvider,
    extensionId: string,
): Promise<Map<string, VersionInfo>> {
    const registries = getRegistries(registry);
    const name = stripPublisher(extensionId);

    return await _findChannels(registries, name);
}

function getRegistries(registry: Registry | RegistryProvider) {
    return registry instanceof RegistryProvider ? registry.getRegistries() : [registry];
}

async function _findPackage(registries: readonly Registry[], name: string, version?: string) {
    for (const registry of registries) {
        const pkg = await tryGetPackage(registry, name, version);

        if (pkg) {
            return pkg;
        }
    }

    throw new Error(localize('cannot.find.extension', 'Cannot find "{0}" in known registries.', name));
}

async function _findVersions(registries: readonly Registry[], name: string) {
    const results = new Map<string, VersionInfo>();

    for (const registry of registries) {
        const versions = await tryGetVersions(registry, name);

        if (versions) {
            versions.forEach((v) => results.set(v.version.toString(), v));
        }
    }

    return [...results.values()];
}

async function _findChannels(registries: readonly Registry[], name: string) {
    const results = new Map<string, VersionInfo>();

    for (const registry of registries) {
        const channels = await tryGetChannels(registry, name);

        if (channels) {
            for (const key in channels) {
                results.set(key, channels[key]);
            }
        }
    }

    return results;
}

async function tryGetPackage(registry: Registry, name: string, version?: string) {
    try {
        return await registry.getPackage(name, version);
    } catch (ex) {
        if (ex.statusCode === 404) {
            // Ignore 404 errors. The registry does not have the package.
            return null;
        } else {
            throw ex;
        }
    }
}

async function tryGetVersions(registry: Registry, name: string) {
    try {
        return await registry.getPackageVersions(name);
    } catch (ex) {
        if (ex.statusCode === 404) {
            // Ignore 404 errors. The registry does not have the package.
            return null;
        } else {
            throw ex;
        }
    }
}

async function tryGetChannels(registry: Registry, name: string) {
    try {
        return await registry.getPackageChannels(name);
    } catch (ex) {
        if (ex.statusCode === 404) {
            // Ignore 404 errors. The registry does not have the package.
            return null;
        } else {
            throw ex;
        }
    }
}

function stripPublisher(extensionId: string) {
    const dot = extensionId.indexOf('.');
    if (dot < 0) {
        return extensionId;
    }

    return extensionId.substr(dot + 1);
}
