import { isBoundary, type BoundaryCondition } from "$lib/Boundary";
import { Debug } from "$lib/details/Util";
import type { Id } from "$lib/Schema";
import type {
    Commit,
    ReadonlyVersionControl,
    VersionControlChange,
} from "$lib/VersionControl.svelte";

/** Stable key for a boundary condition, independent of property order. */
function conditionKey(b: BoundaryCondition) {
    return [
        b.delay ?? '',
        b.selectionSet ? 1 : 0,
        b.focusedClusterChange ? 1 : 0,
        b.hasLabel ? 1 : 0,
        b.fileSaved ? 1 : 0,
    ].join('|');
}

/**
 * Boundary and ancestor data that survives between layout calls.
 *
 * History is append-only, so almost all cached entries stay valid. The cache is
 * cleared when boundary conditions change and updated incrementally when a
 * commit is added or its attributes change. Forced nodes (current commit and
 * diff target) are intentionally *not* part of this cache; they are overlaid
 * per layout call, since they change much more often than the history.
 */
export class GraphLayoutCache {
    #vc: ReadonlyVersionControl;
    #condition: BoundaryCondition = {};
    #conditionKey = conditionKey({});
    #initialized = false;

    /** Boundary result for each commit under the current condition. */
    #boundary = new Map<Id<Commit>, boolean>();
    #boundarySet = new Set<Id<Commit>>();
    /** For non-boundary commits: nearest boundary ancestor (ignoring forced nodes). */
    #baseAncestor = new Map<Id<Commit>, Id<Commit>>();

    constructor(vc: ReadonlyVersionControl) {
        this.#vc = vc;
    }

    setCondition(b: BoundaryCondition) {
        const key = conditionKey(b);
        if (key === this.#conditionKey) return;
        this.#conditionKey = key;
        this.#condition = b;
        this.reset();
    }

    reset() {
        this.#initialized = false;
        this.#boundary.clear();
        this.#boundarySet.clear();
        this.#baseAncestor.clear();
    }

    get boundarySet(): ReadonlySet<Id<Commit>> {
        return this.#boundarySet;
    }

    /** Make sure every commit has a boundary entry for the current condition. */
    ensureInitialized() {
        if (this.#initialized) return;
        this.#initialized = true;
        this.#boundary.clear();
        this.#boundarySet.clear();
        this.#baseAncestor.clear();

        this.#boundarySet.add(this.#vc.initialCommit);
        for (const id of this.#vc.sortedCommits) {
            if (!this.#vc.isDelta(id)) continue;
            const value = isBoundary(this.#vc, id, 'forward', this.#condition);
            this.#boundary.set(id, value);
            if (value) this.#boundarySet.add(id);
        }
    }

    notify(change: VersionControlChange) {
        // If nobody has laid out the graph yet, the next initialization will
        // read the current state anyway.
        if (!this.#initialized) return;

        switch (change.type) {
            case 'add':
                if (this.#vc.isDelta(change.id)) this.#updateBoundary(change.id);
                if (change.parent) this.#updateBoundary(change.parent);
                break;
            case 'attrs': {
                this.#updateBoundary(change.id);
                const commit = this.#vc.get(change.id);
                // The parent's delay/cluster boundary depends on this commit.
                if (commit?.type === 'delta') this.#updateBoundary(commit.parent);
                break;
            }
            default:
                change satisfies never;
        }
    }

    /**
     * Nearest boundary ancestor of a non-boundary commit. Force-visible commits
     * must be removed from the chain by the caller before calling this.
     */
    baseAncestor(id: Id<Commit>): Id<Commit> {
        const path: Id<Commit>[] = [];
        let p = id;
        while (p !== this.#vc.initialCommit && !this.#boundarySet.has(p)) {
            const cached = this.#baseAncestor.get(p);
            if (cached !== undefined) {
                p = cached;
                break;
            }

            path.push(p);
            const commit = this.#vc.get(p);
            Debug.assert(!!commit && commit.type === 'delta');
            p = commit.parent;
        }

        for (const skipped of path) this.#baseAncestor.set(skipped, p);
        return p;
    }

    #updateBoundary(id: Id<Commit>) {
        if (id === this.#vc.initialCommit) return;

        const value = isBoundary(this.#vc, id, 'forward', this.#condition);
        const old = this.#boundary.get(id);
        if (old === value) return;

        this.#boundary.set(id, value);
        if (value) this.#boundarySet.add(id);
        else this.#boundarySet.delete(id);

        if (old !== undefined) this.#invalidateSegment(id);
    }

    /**
     * A commit becoming (or no longer being) a boundary changes the nearest
     * boundary ancestor of the non-boundary commits in its segment.
     */
    #invalidateSegment(id: Id<Commit>) {
        this.#baseAncestor.delete(id);

        const stack = [...this.#vc.forwardLinks(id)];
        while (stack.length > 0) {
            const commit = stack.pop()!;
            if (commit === this.#vc.initialCommit) continue;
            if (this.#boundarySet.has(commit)) continue;

            this.#baseAncestor.delete(commit);
            stack.push(...this.#vc.forwardLinks(commit));
        }
    }
}
