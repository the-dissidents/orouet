/** T must not be a function type! */
export type Wrapped<T> = T | (() => T);

/** T must not be a function type! */
export function unwrap<T>(x: Wrapped<T>) {
    // @ts-expect-error
    return typeof x === 'function' ? x() : x;
}

export const Debug: {
    assert(x: boolean, file?: string, line?: number): asserts x
} = {
    assert(x: boolean, file?: string, line?: number): asserts x {
        if (!!!x) throw new Error('assertion failed ' + file ? `[${file}@${line}]` : '[?]');
    }
};
