/**
 * Minimal EventHost stub for node-based unit tests. The real implementation
 * lives in @the_dissidents/svelte-ui, which is a Svelte package and cannot be
 * resolved by the plain-node Vitest environment.
 */
export class EventHost<T extends unknown[] = []> {
    #listeners = new Set<(...args: T) => void>();

    bind(_owner: object, listener: (...args: T) => void) {
        this.#listeners.add(listener);
    }

    unbind(_owner: object, listener: (...args: T) => void) {
        this.#listeners.delete(listener);
    }

    dispatch(...args: T) {
        for (const listener of this.#listeners) listener(...args);
    }
}
