import { ConfigurationTarget } from 'vscode';

import { getConfig, formatExtensionId } from './util';

/**
 * Name for the default release channel.
 */
export const LATEST = 'latest';

/**
 * Gets the user's selected release channel for an extension.
 */
export function getReleaseChannel(extensionId: string): string;
/**
 * Gets the user's selected release channel for an extension.
 */
export function getReleaseChannel(publisher: string, name: string): string;
export function getReleaseChannel(publisherOrId: string, name?: string): string {
    const id = name ? formatExtensionId(publisherOrId, name) : publisherOrId;

    return getChannelConfig()?.[id] ?? LATEST;
}

/**
 * Sets the user's release channel for an extension.
 */
export function setReleaseChannel(extensionId: string, channel: string): void;
/**
 * Sets the user's release channel for an extension.
 */
export function setReleaseChannel(publisher: string, name: string, channel: string): void;
export function setReleaseChannel(publisherOrId: string, nameOrChannel: string, channel?: string): void {
    let id: string;
    if (channel) {
        id = formatExtensionId(publisherOrId, nameOrChannel);
    } else {
        id = publisherOrId;
        channel = nameOrChannel;
    }

    // Configuration objects shouldn't be modified, so make a clone of the
    // channel dictionary that we can modify and replace the config with it.
    const config = cloneConfig(getChannelConfig() ?? {});

    if (channel === LATEST) {
        delete config[id];
    } else {
        config[id] = channel;
    }

    setChannelConfig(config);
}

function getChannelConfig() {
    return getConfig().get<Record<string, string>>('channels');
}

function setChannelConfig(channels?: Record<string, string>) {
    getConfig().update('channels', channels, ConfigurationTarget.Global);
}

function cloneConfig<T>(obj: Record<string, T>): Record<string, T> {
    return Object.fromEntries(Object.entries(obj));
}
