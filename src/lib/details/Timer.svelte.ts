import { Debug } from "./Util";

type TimerType = ReturnType<typeof setInterval>;

export class Timer {
    #time = $state(0);

    #start: number = -1;
    #accumulated: number = 0;
    #timeout?: TimerType;

    constructor(private intervalMs: number) {}

    get time() {
        return this.#time;
    }

    start() {
        // Debug.assert(this.#timeout === undefined);
        if (this.#timeout) clearInterval(this.#timeout);
        this.#start = performance.now();
        this.#time = this.#accumulated;
        this.#timeout = setInterval(() => {
            this.#time = performance.now() - this.#start + this.#accumulated;
        }, this.intervalMs);
    }

    stop() {
        Debug.assert(this.#timeout !== undefined);
        clearInterval(this.#timeout);
        this.#time = performance.now() - this.#start + this.#accumulated;
        this.#accumulated = 0;
        return this.#time;
    }

    pause() {
        Debug.assert(this.#timeout !== undefined);
        clearInterval(this.#timeout);
        this.#time = performance.now() - this.#start + this.#accumulated;
        this.#accumulated = this.#time;
        return this.#time;
    }
}
