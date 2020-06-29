import * as cacache from 'cacache';
import * as search from 'libnpmsearch';
import * as nock from 'nock';
import * as querystring from 'querystring';
import * as url from 'url';

/**
 * A subset of the fields for a version of the full metadata for a package.
 */
export interface PackageVersion {
    name: string;
    displayName?: string;
    description?: string;
    version: string;
    author?: {
        email: string;
        name: string;
    };
    publisher?: string;
    engines?: Record<string, string>;
    dist: {
        shasum: string;
        tarball: string;
    };
    files?: string[];
}

/**
 * A subset of the fields for the full metadata for a package.
 */
export interface PackageMetadata {
    name: string;
    description?: string;
    'dist-tags': Record<string, string>;
    versions: Record<string, PackageVersion>;
}

/**
 * Clears the caches for NPM requests.
 */
export function clearCache(): void {
    cacache.clearMemoized();
}

/**
 * Configures nock to respond with the given results when running a package
 * search for specific search text.
 * @param scope Nock scope
 * @param text Search text to match.
 * @param results Package results to reply with.
 */
export function mockSearch(scope: nock.Scope, text: string, results: readonly search.Result[]): void {
    scope
        .get('/-/v1/search')
        .query((query) => query.text === text)
        .reply(200, (uri) => {
            const { from, size } = parseSearchSlice(uri);
            const slice = results.slice(from, from + size);

            return detailedResults(slice);
        });
}

/**
 * Gets the start index and number of results to return for a search request.
 */
function parseSearchSlice(uri: string) {
    const query = querystring.parse(url.parse(uri).query ?? '');

    if (Array.isArray(query.from)) {
        throw new Error('Too many "from" parameters');
    }
    if (Array.isArray(query.size)) {
        throw new Error('Too many "size" parameters');
    }

    const from = parseInt(query.from ?? '0');
    const size = parseInt(query.size ?? '100');

    return { from, size };
}

/**
 * Wraps the given search results in a detailed result object.
 */
function detailedResults(results: readonly search.Result[]): { objects: search.DetailedResult[] } {
    const objects = results.map((pkg) => {
        return {
            score: {
                detail: {
                    quality: 0,
                    popularity: 0,
                    maintenance: 0,
                },
                final: 0,
            },
            searchScore: 1,
            package: pkg,
        };
    });

    return { objects };
}
