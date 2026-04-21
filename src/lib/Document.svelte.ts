import type { Node } from "prosemirror-model";
import { BlockSchema } from "./BlockSchema";

export type TextBlock = {
    // id
    id: number,
    index?: number,
    headingLevel?: 1|2|3|4|5|6,
    content: Node
};

export type TextCluster = {
    // id
    id: number,
    source: TextBlock[],
    target: TextBlock[],
    // alignment matrix
};

let id = 0;
function getId() {
    id++;
    return id;
}

export class DocumentState {
    // commit id
    #clusters: TextCluster[] = $state([]);

    get clusters(): ReadonlyArray<TextCluster> {
        return this.#clusters;
    }

    constructor(c: TextCluster[]) {
        this.#clusters = c;
        this.#updateIndices();
    }

    removeBlock(b: TextBlock, type: 'source' | 'target') {
        const [i, j] = this.findBlockIndex(b, type)!;
        const c = this.#clusters[i];
        c[type].splice(j, 1);
        this.#updateIndices();
    }

    insertBlock(b: TextBlock, type: 'source' | 'target', i: number, j: number) {

    }

    #updateIndices() {
        let i = 0, j = 0;
        for (const c of this.#clusters) {
            c.source.forEach((v) => v.index = i++);
            c.target.forEach((v) => v.index = j++);
        }
    }

    findBlockIndex(b: TextBlock, type: 'source' | 'target'): [number, number] | null {
        let j: number | undefined;
        const i = this.#clusters.findIndex(
            (x) => (j = x[type].findIndex((y) => y.id == b.id)) >= 0);
        if (i >= 0 && j !== undefined && j >= 0)
            return [i, j];
        return null;
    }

    *iterateBlock(b: TextBlock, type: 'source' | 'target', until?: TextBlock) {
        const idx = this.findBlockIndex(b, type);
        if (!idx) return;

        let [i, j] = idx;
        while (i < this.#clusters.length) {
            const blocks = this.#clusters[i][type];
            while (j < blocks.length) {
                yield blocks[j];
                if (blocks[j] === until) return;
                j++;
            }
            j = 0;
            i++;
        }
    }

    static fromSourceStrings(s: string[]) {
        return new DocumentState(s.map((x) => ({
            id: getId(),
            source: [{ id: getId(), content: BlockSchema.nodes.block.create(null, [BlockSchema.text(x)]) }],
            target: [{ id: getId(), content: BlockSchema.nodes.block.create() }]
        })));
    }
};
