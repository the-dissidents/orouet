export type TextBlock = {
    // id
    content: string
};

export type TextCluster = {
    // id
    source: TextBlock[],
    target: TextBlock[],
    // alignment matrix
};

export class DocumentState {
    // commit id
    activeCluster: WeakRef<TextCluster> | null = $state(null);
    #clusters: TextCluster[] = $state([]);

    get clusters(): ReadonlyArray<TextCluster> {
        return this.#clusters;
    }

    constructor(c: TextCluster[]) {
        this.#clusters = c;
    }

    static fromSourceStrings(s: string[]) {
        return new DocumentState(s.map((x) => ({
            source: [{ content: x }],
            target: [{ content: '' }]
        })));
    }
};
