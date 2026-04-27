import type { Node } from "prosemirror-model";
import { Debug } from "./details/Util";
import { PaneSchema } from "./Schema";

export type TextOptions = {
    numericStyle: 'lining' | 'oldstyle' | 'tabular';
    justify: boolean;
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
        justify: false,
        sizeAdjustment: 1,
        ligatures: { common: true }
    },
    'zh': {
        numericStyle: 'lining',
        justify: true,
        sizeAdjustment: 1,
        ligatures: { common: true }
    }
};

export type Text = {
    content: Node,
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
                content: PaneSchema.nodes.doc.createChecked({}, s.map((x, index) =>
                    PaneSchema.nodes.cluster.createChecked({ index },
                        PaneSchema.nodes.block.createChecked({}, PaneSchema.text(x.trim()))))),
                options: DefaultOptions.en
            },
            {
                content: PaneSchema.nodes.doc.createChecked({}, s.map((x, index) =>
                    PaneSchema.nodes.cluster.createChecked({ index },
                        PaneSchema.nodes.block.createChecked({}, [])))),
                options: DefaultOptions.zh
            }
        );
    }
}
