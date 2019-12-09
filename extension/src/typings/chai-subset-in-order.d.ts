declare module 'chai-subset-in-order' {
    global {
        namespace Chai {
            interface Assertion {
                containSubsetInOrder(expected: any): Assertion;
            }
            interface Assert {
                containSubsetInOrder(val: any, exp: any, msg?: string): void;
            }
        }
    }

    const chaiSubsetInOrder: Chai.ChaiPlugin;
    export = chaiSubsetInOrder;
}
