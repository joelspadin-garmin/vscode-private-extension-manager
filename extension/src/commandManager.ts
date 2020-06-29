/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *  See https://github.com/microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface Command {
    readonly id: string;

    execute(...args: any[]): void;
}

export class CommandManager {
    private readonly commands = new Map<string, vscode.Disposable>();

    public dispose(): void {
        for (const registration of this.commands.values()) {
            registration.dispose();
        }
        this.commands.clear();
    }

    public register(...commands: Command[]): void {
        for (const command of commands) {
            this.registerCommand(command.id, command.execute, command);
        }
    }

    private registerCommand(id: string, impl: (...args: any[]) => void, thisArg?: any) {
        if (this.commands.has(id)) {
            return;
        }

        this.commands.set(id, vscode.commands.registerCommand(id, impl, thisArg));
    }
}
