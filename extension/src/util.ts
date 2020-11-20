import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import memoizeOne from 'memoize-one';
import * as path from 'path';
import rimraf = require('rimraf');
import { promisify } from 'util';
import { Uri, workspace, WorkspaceConfiguration } from 'vscode';

import { context } from './context';

const readFile = promisify(fs.readFile);

export function getConfig(): WorkspaceConfiguration {
    return workspace.getConfiguration('privateExtensions');
}

/**
 * Gets the cache directory for NPM web requests.
 */
export function getNpmCacheDir(): string | undefined {
    if (context) {
        return Uri.joinPath(context.globalStorageUri, 'cache').fsPath;
    } else {
        return undefined;
    }
}

/**
 * Gets a temporary directory to which NPM packages can be downloaded.
 */
export function getNpmDownloadDir(): string {
    if (context) {
        return Uri.joinPath(context.globalStorageUri, 'packages').fsPath;
    } else {
        return path.resolve('./packages');
    }
}

/**
 * Deletes the contents of `getNpmDownloadDir()`.
 */
export async function deleteNpmDownloads(): Promise<void> {
    const downloadDir = getNpmDownloadDir();
    await rimrafPromise(downloadDir);
}

/**
 * Gets whether an object is an array and is not empty.
 */
export function isNonEmptyArray(arg: unknown): arg is unknown[] {
    return Array.isArray(arg) && arg.length > 0;
}

/**
 * Decorator to memoize a function using `memoizeOne`.
 */
export function memoize(_target: unknown, _key: string, descriptor: PropertyDescriptor): void {
    const oldFunc = descriptor.value;
    const newFunc = memoizeOne(oldFunc);

    descriptor.value = function (...args: any[]) {
        return newFunc.apply(this, ...args);
    };
}

/**
 * Reads a JSON file and returns the parsed contents.
 *
 * The JSON file may contain non-standard elements such as comments and trailing
 * commas.
 */
export async function readJSON(file: string | Uri): Promise<any> {
    file = file instanceof Uri ? file.fsPath : file;

    const text = await readFile(file, 'utf8');
    return jsonc.parse(text);
}

/**
 * Synchronously reads a JSON file and returns the parsed contents.
 *
 * The JSON file may contain non-standard elements such as comments and trailing
 * commas.
 */
export function readJSONSync(file: string | Uri): any {
    file = file instanceof Uri ? file.fsPath : file;

    const text = fs.readFileSync(file, 'utf8');
    return jsonc.parse(text);
}

export function rimrafPromise(path: string, options?: rimraf.Options): Promise<void> {
    return new Promise((resolve, reject) => {
        rimraf(path, options ?? {}, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

/**
 * Gets a Uri to a file belonging to this extension.
 * @param extensionFile Relative path to the file.
 */
export function getExtensionFileUri(extensionFile: string): Uri {
    return Uri.file(context.asAbsolutePath(extensionFile));
}

/**
 * Compares two `Uri` objects for equality.
 */
export function uriEquals(a: Uri, b: Uri): boolean {
    return a.toString() === b.toString();
}

/**
 * Returns an extension identifier given the publisher and extension name.
 */
export function formatExtensionId(publisher: string, name: string): string {
    return `${publisher}.${name}`.toLowerCase();
}
