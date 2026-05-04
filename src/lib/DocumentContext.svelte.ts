import type { Node } from "prosemirror-model";
import { Debug } from "./details/Util";
import { id, makeBlock, makeCluster, makeDoc, PaneSchema, type Doc } from "./Schema";

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
    source: Text;
    target: Text;

    private constructor(
        source: Text,
        target: Text
    ) {
        Debug.assert(source.content.type === PaneSchema.topNodeType);
        Debug.assert(target.content.type === PaneSchema.topNodeType);
        Debug.assert(source.content.childCount === target.content.childCount);

        this.source = $state(source);
        this.target = $state(target);
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
