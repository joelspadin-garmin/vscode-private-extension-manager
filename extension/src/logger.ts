import * as vscode from 'vscode';

export class Logger {
    public readonly channel: vscode.OutputChannel;

    constructor(name: string) {
        this.channel = vscode.window.createOutputChannel(name);
    }

    public log(message: any) {
        this.channel.appendLine(message.toString());
    }
}

let logger: Logger | undefined;

/**
 * Gets a singleton instance of a logger that writes to an OutputChannel.
 */
export function getLogger() {
    if (!logger) {
        logger = new Logger('Private Extension Manager');
    }

    return logger;
}
