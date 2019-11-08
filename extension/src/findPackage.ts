import * as npa from 'npm-package-arg';
import * as nls from 'vscode-nls';

import { Package } from './Package';
import { Registry, VersionInfo } from './Registry';
import { RegistryProvider } from './RegistryProvider';

const localize = nls.loadMessageBundle();

/**
 * Finds a package the given extension ID, searching one or more registries
 * @param registry The registry containing the extension package, or a registry provider to search.
 * @param extensionId The extension ID of the package to find. May optionally contain an version tag
 *      such as "garmin.example-extension@1.0.0" to find a specific version of the extension.
 */
export async function findPackage(registry: Registry | RegistryProvider, extensionId: string) {
    const registries = getRegistries(registry);

    const { name, fetchSpec } = parseExtensionId(extensionId);

    return await _findPackage(registries, name, fetchSpec);
}

/**
 * Gets the list of all available versions of an extension, searching one or more registries.
 * @param registry The registry containing the extension package, or a registry provider to search.
 * @param extensionId The extension ID of the package to find.
 */
export async function getPackageVersions(registry: Registry | RegistryProvider, extensionId: string) {
    const registries = getRegistries(registry);

    const { name } = parseExtensionId(extensionId);

    return await _findVersions(registries, name);
}

function getRegistries(registry: Registry | RegistryProvider) {
    return registry instanceof RegistryProvider ? registry.getRegistries() : [registry];
}

function parseExtensionId(extensionId: string) {
    const spec = stripPublisher(extensionId);
    const { name, fetchSpec } = npa(spec);

    if (!name || !fetchSpec) {
        throw new Error(localize('invalid.extension.id', 'Invalid extension ID "{0}"', extensionId));
    }

    return { name, fetchSpec };
}

async function _findPackage(registries: readonly Registry[], name: string, version: string) {
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
            versions.forEach(v => results.set(v.version.toString(), v));
        }
    }

    return [...results.values()];
}

async function tryGetPackage(registry: Registry, name: string, version: string) {
    try {
        const manifest = await registry.getPackageVersionMetadata(name, version);
        return new Package(registry, manifest);
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

function stripPublisher(extensionId: string) {
    const dot = extensionId.indexOf('.');
    if (dot < 0) {
        return extensionId;
    }

    return extensionId.substr(dot + 1);
}
