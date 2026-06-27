import { Debug } from "./Util";

export class DebouncedTask<Args extends any[]> {
    private lastTime = 0;
    private scheduled?: NodeJS.Timeout;
    private currentArgs?: { args: Args};

    constructor(
        private f: (...args: Args) => void,
        /** The minimal time between invocations */
        public timeout = 1000
    ) { }

    request(...args: Args) {
        this.currentArgs = {args};
        if (this.scheduled) return;

        const time = performance.now();
        if (time - this.lastTime > this.timeout) {
            this.f(...args);
            this.lastTime = performance.now();
        } else {
            this.scheduled = setTimeout(() => {
                this.scheduled = undefined;
                Debug.assert(!!this.currentArgs);
                this.f(...this.currentArgs.args);
                this.lastTime = performance.now();
            }, time - this.lastTime);
        }
    }

    cancel() {
        if (this.scheduled) {
            clearTimeout(this.scheduled);
            return true;
        }
        return false;
    }
}
