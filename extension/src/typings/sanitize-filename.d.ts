declare module 'sanitize-filename' {
    interface Options {
        replacement?: string | ((inv: string) => string);
    }

    function sanitize(inputString: string, options?: Options): string;

    export = sanitize;
}
