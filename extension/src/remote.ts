import * as dns from 'dns';
import memoizeOne from 'memoize-one';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

const localize = nls.loadMessageBundle();

const reverseDns = promisify(dns.reverse);

/**
 * Gets a string that represents the remote machine when in a remote workspace.
 */
export const getRemoteName = memoizeOne(async () => {
    // vscode doesn't provide an API for this, so we have to reverse-engineer it
    // based on which remote is active.
    // TODO: handle WSL and container remotes
    switch (vscode.env.remoteName) {
        case 'ssh-remote':
            return localize('ssh.remote', 'SSH: {0}', await getSshHostName());

        default:
            return vscode.env.remoteName ?? '';
    }
});

/**
 * Gets the hostname or IP address of the SSH server when in a SSH remote
 * workspace.
 */
async function getSshHostName() {
    // SSH_CONNECTION="clientAddr clientPort serverAddr serverPort"
    const sshConnection = process.env['SSH_CONNECTION'];

    if (sshConnection) {
        // SSH_CONNECTION has an IP address. We want to display the hostname
        // if possible, falling back to the address if not.
        const addr = sshConnection.split(' ')[2];

        if (addr) {
            try {
                const hostnames = await reverseDns(addr);
                return hostnames[0];
            } catch (ex) {
                return addr;
            }
        }
    }

    return localize('unknown', 'Unknown');
}
