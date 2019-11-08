import { Options } from 'libnpmsearch';
import { CancellationToken, Uri } from 'vscode';
import * as fs from 'fs';
import * as npa from 'npm-package-arg';
import * as npmfetch from 'npm-registry-fetch';
import * as npmsearch from 'libnpmsearch';
import * as pacote from 'pacote';
import * as path from 'path';
import sanitize = require('sanitize-filename');

import { Package, NotAnExtensionError } from './Package';
import { getNpmCacheDir, getNpmDownloadDir, uriEquals } from './util';
import { SemVer } from 'semver';

/** Maximum number of search results per request. */
const QUERY_LIMIT = 100;

export enum RegistrySource {
    /** Registry is defined by user settings. */
    User = 'user',
    /** Registry is defined by a workspace folder's extensions.private.json. */
    Workspace = 'workspace',
}

export interface RegistryOptions {
    /**
     * URL of the NPM registry to use. If omitted, this uses NPM's normal
     * resolution scheme (searches .npmrc, user config, etc.).
     */
    registry: string;

    /**
     * If set, only return packages that match this query.
     *
     * Use this when your registry contains more packages than just VS Code
     * extensions to filter to just the packages that are extensions, or when
     * it contains multiple groups of extensions and you only want to display
     * some of them.
     *
     * See https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#get-v1search
     * for special search qualifiers such as `keywords:`.
     */
    query: string | string[];
}

export interface VersionInfo {
    version: SemVer;
    time?: Date;
}

interface PackageVersionData {
    'dist-tags': Record<string, string>;
    time?: Record<string, string>;
    versions: Record<string, Record<string, unknown>>;
    [key: string]: unknown;
}

/**
 * Represents an NPM registry.
 */
export class Registry {
    /**
     * Comparison function to sort registries by name in alphabetical order.
     */
    public static compare(a: Registry, b: Registry) {
        const nameA = a.name.toUpperCase();
        const nameB = b.name.toUpperCase();

        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    }

    public readonly query: string | string[];

    public readonly options: Partial<Options>;

    constructor(
        public readonly name: string,
        public readonly source: RegistrySource,
        options: Partial<RegistryOptions & Options>,
    ) {
        const { query, ...searchOpts } = options;

        // '*' seems to work as a "get all packages" wildcard. If we just
        // leave the search text blank, it will return nothing.
        this.query = query ?? '*';
        this.options = searchOpts;

        this.options.cache = getNpmCacheDir();
    }

    /**
     * The Uri of the registry, if configured. If this is `undefined`, NPM's
     * normal resolution scheme is used to find the registry.
     */
    public get uri() {
        return this.options.registry ? Uri.parse(this.options.registry) : undefined;
    }

    /**
     * Gets whether this registry has the same Uri and filtering options as
     * another registry.
     */
    public equals(other: Registry) {
        if (!queryEquals(this.query, other.query)) {
            return false;
        }

        if (this.uri && other.uri) {
            return uriEquals(this.uri, other.uri);
        } else {
            return this.uri === undefined && other.uri === undefined;
        }
    }

    /**
     * Download a package and return the Uri of the directory where it was
     * extracted.
     *
     * @param packageOrSpec A package to download, or an NPM package specifier.
     */
    public async downloadPackage(packageOrSpec: Package | string) {
        const spec = packageOrSpec instanceof Package ? packageOrSpec.spec : packageOrSpec;

        const registryDir = sanitize(this.options.registry ?? this.name);
        const dest = path.join(getNpmDownloadDir(), registryDir, spec);

        // If we've already downloaded this package, just return it.
        if (!fs.existsSync(dest)) {
            await pacote.extract(spec, dest, this.options);
        }

        return Uri.file(dest);
    }

    /**
     * Gets all packages matching the registry options.
     *
     * @param token Token to use to cancel the search.
     */
    public async getPackages(token?: CancellationToken): Promise<Package[]> {
        const packages: Package[] = [];

        for await (const result of this.findMatchingPackages(this.query, token)) {
            if (token?.isCancellationRequested) {
                break;
            }

            try {
                const manifest = await this.getPackageVersionMetadata(result.name, 'latest');
                packages.push(new Package(this, manifest));
            } catch (ex) {
                if (ex instanceof NotAnExtensionError) {
                    // Package is not an extension. Ignore.
                } else {
                    console.warn(`Discarding package ${result.name}:`, ex);
                }
            }
        }

        await Promise.all(packages.map(pkg => pkg.updateState()));

        return packages;
    }

    /**
     * Gets the full package metadata for a package.
     */
    public async getPackageMetadata(name: string) {
        const spec = npa(name);
        return await npmfetch.json(`/${spec.escapedName}`, this.options);
    }

    /**
     * Gets the list of available versions for a package.
     */
    public async getPackageVersions(name: string): Promise<VersionInfo[]> {
        const metadata = await this.getPackageMetadata(name);

        if (hasVersionData(metadata)) {
            return Object.keys(metadata.versions).map(key => {
                const version = new SemVer(key);
                const time = getVersionTimestamp(metadata, key);
                return { version, time };
            });
        } else {
            return [];
        }
    }

    /**
     * Gets the version-specific metadata for a specific version of a package.
     *
     * If `version` is omitted or `"latest"`, this returns the latest version.
     */
    public async getPackageVersionMetadata(name: string, version: string = 'latest') {
        const metadata = await this.getPackageMetadata(name);

        if (hasVersionData(metadata)) {
            if (!(version in metadata.versions)) {
                version = metadata['dist-tags'][version];
            }

            return metadata.versions[version];
        } else {
            throw new Error(`Missing required fields "dist-tags" and "versions" in package "${name}"`);
        }
    }

    private async *findMatchingPackages(query: string | readonly string[], token?: CancellationToken) {
        let from = 0;
        while (true) {
            if (token?.isCancellationRequested) {
                break;
            }

            const page = await npmsearch(query, {
                ...this.options,
                'prefer-online': true,
                from,
                limit: QUERY_LIMIT,
            });

            for (const item of page) {
                yield item;
            }

            // The server may ignore our query limit and return as many results
            // as it wants. We've collected everything when it returns nothing.
            if (page.length === 0) {
                break;
            } else {
                from += page.length;
            }
        }
    }
}

function queryEquals(a: string | readonly string[], b: string | readonly string[]) {
    // libnpmsearch internally joins array queries with spaces, so
    // ["foo", "bar"] and "foo bar" are the same query.
    a = Array.isArray(a) ? a.join(' ') : a;
    b = Array.isArray(b) ? b.join(' ') : b;

    return a === b;
}

function hasVersionData(meta: Record<string, unknown>): meta is PackageVersionData {
    return (
        typeof meta === 'object' &&
        meta !== null &&
        typeof meta['dist-tags'] === 'object' &&
        meta['dist-tags'] !== null &&
        typeof meta['versions'] === 'object' &&
        meta['versions'] !== null &&
        (typeof meta['time'] === 'undefined' || (typeof meta['time'] === 'object' && meta['time'] !== null))
    );
}

function getVersionTimestamp(meta: PackageVersionData, key: string) {
    const time = meta.time?.[key];
    return time ? new Date(time) : undefined;
}
