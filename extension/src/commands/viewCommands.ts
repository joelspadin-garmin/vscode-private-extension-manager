import { Command } from '../commandManager';
import { RegistryView } from '../views/registryView';

export class RefreshCommand implements Command {
    public readonly id = 'privateExtensions.refresh';

    constructor(private readonly registryView: RegistryView) {}

    public execute(): void {
        this.registryView.refresh();
    }
}
