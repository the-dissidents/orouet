import { Debug } from "./details/Util";
import { id, makeBlock, makeCluster, makeDoc, PaneSchema, type Doc, type Id } from "./Schema";
import { serializeStep, VersionControl, type Commit, type DeltaCommit, type ReadonlyVersionControl } from "./VersionControl";
import type { Step } from "prosemirror-transform";

export type EmphasisStyle = 'italic' | 'bold' | 'smallcaps' | 'underline' | 'mark' | 'gesperrt';

export type TextOptions = {
    numericStyle: 'lining' | 'oldstyle' | 'tabular';
    emphasisStyle: EmphasisStyle;
    keywordStyle: EmphasisStyle;
    justify: boolean;
    hyphenation: boolean;
    sizeAdjustment: number;
    ligatures: {
        common?: boolean,
        discretionary?: boolean,
        historical?: boolean,
        contextual?: boolean
    }
};

export const DefaultOptions: Record<string, TextOptions> = {
    'en': {
        numericStyle: 'oldstyle',
        emphasisStyle: 'italic',
        keywordStyle: 'bold',
        justify: false,
        hyphenation: false,
        sizeAdjustment: 1,
        ligatures: { common: true }
    },
    'zh': {
        numericStyle: 'lining',
        emphasisStyle: 'mark',
        keywordStyle: 'bold',
        justify: true,
        hyphenation: false,
        sizeAdjustment: 1,
        ligatures: { common: true }
    }
};

export type Text = {
    content: Doc,
    options: TextOptions
};

export class DocumentContext {
    readonly source: Text;
    readonly target: Text;

    #currentCommit: Id<Commit>;
    #vc: VersionControl;

    get currentCommitId() {
        return this.#currentCommit;
    }

    get versionControl(): ReadonlyVersionControl {
        return this.#vc;
    }

    private constructor(
        source: Text,
        target: Text,
        initialCommit: Id<Commit> = id()
    ) {
        Debug.assert(source.content.type === PaneSchema.topNodeType);
        Debug.assert(target.content.type === PaneSchema.topNodeType);
        Debug.assert(source.content.childCount === target.content.childCount);

        this.source = $state(source);
        this.target = $state(target);

        this.#vc = new VersionControl(initialCommit);
        this.#currentCommit = initialCommit;
    }

    addSteps(where: 'source' | 'target', steps: Step[], cid: Id<DeltaCommit> = id()) {
        Debug.assert(steps.length > 0);
        this.#vc.add({
            type: 'delta',
            where, id: cid,
            timestamp: Date.now(),
            steps: {
                list: steps.map((x) => serializeStep(x)),
                parent: cid
            },
            parent: this.#currentCommit
        });
        console.log(`created commit ${cid} with ${steps.length} steps`);
        this.#currentCommit = cid;
    }

    static fromTestClusters(s: string[]) {
        return new DocumentContext(
            {
                content: makeDoc(s.map((x) =>
                    makeCluster(id(), [makeBlock(id(), PaneSchema.text(x.trim()))]))),
                options: DefaultOptions.en
            },
            {
                content: makeDoc(s.map(() =>
                    makeCluster(id(), [makeBlock(id(), [])]))),
                options: DefaultOptions.zh
            }
        );
    }
}
