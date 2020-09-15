import { isLeft } from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import * as nls from 'vscode-nls/node';

const localize = nls.loadMessageBundle();

/**
 * Gets the type name for an options type.
 * @param required Set of required properties.
 * @param optional Set of optional properties.
 */
function getOptionsTypeName(required: t.Props, optional: t.Props) {
    const propNames = [
        ...Object.keys(required).map((k) => `${k}: ${required[k].name}`),
        ...Object.keys(optional).map((k) => `${k}?: ${optional[k].name}`),
    ].join(', ');

    return `{ ${propNames} }`;
}

/**
 * Splices together the context for an options type and the contexts for any
 * errors reported by its inner intersection codec, removing the context for the
 * intersection itself to hide the inner codec.
 */
function spliceOptionsContext(u: unknown, c: t.Context, errors: t.Errors) {
    return errors.map((e) => t.getValidationError(u, [...c, ...e.context.slice(1)]));
}

/**
 * An io-ts interface with required and optional properties.
 *
 * This is equivalent to the following type, except error messages are easier to
 * read:
 *
 * ```
 * t.intersection([
 *     t.type(required),
 *     t.partial(optional),
 * ])
 * ```
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function options<R extends t.Props, O extends t.Props>(
    required: R,
    optional: O,
    name: string = getOptionsTypeName(required, optional),
) {
    const codec = t.intersection([t.type(required), t.partial(optional)]);

    return new t.Type(
        name,
        codec.is,
        (u, c) => {
            const result = codec.validate(u, []);
            if (isLeft(result)) {
                return t.failures(spliceOptionsContext(u, c, result.left));
            } else {
                return result;
            }
        },
        codec.encode,
    );
}

/**
 * Formats an io-ts error as a localized string.
 */
export function formatError(error: t.ValidationError): string {
    const path = error.context
        .map((c) => c.key)
        .filter((key) => key.length > 0)
        .join('.');

    const errorContext = error.context[error.context.length - 1];

    const expectedType = errorContext.type.name;
    const actualValue = errorContext.actual === undefined ? 'undefined' : JSON.stringify(errorContext.actual);

    if (path) {
        return localize('type.error.at', 'Expected {0} at {1} but got {2}', expectedType, path, actualValue);
    } else {
        return localize('type.error', 'Expected {0} but got {1}', expectedType, actualValue);
    }
}

type ErrorConstructor = new (message?: string) => Error;

/**
 * Throws a TypeError with a localized error message if obj does not match type.
 * @param obj Object to validate.
 * @param type Type to validate against.
 * @param context A string providing more context, e.g. "Invalid foo.bar setting"
 * @param errorType A constructor for an error type to use instead of TypeError.
 */
export function assertType<T>(
    obj: unknown,
    type: t.Type<T>,
    context?: string,
    errorType: ErrorConstructor = TypeError,
): asserts obj is T {
    const result = type.decode(obj);
    if (isLeft(result)) {
        let message = result.left.map((error) => formatError(error)).join(', ');
        if (context) {
            message = localize('error.context', '{0}: {1}', context, message);
        }
        throw new errorType(message);
    }
}
