import type { Node } from "prosemirror-model";
import { Debug } from "./details/Util";
import { PaneSchema } from "./Schema";

export class DocumentContext {
    source: Node;
    target: Node;

    private constructor(
        source: Node,
        target: Node
    ) {
        Debug.assert(source.type === PaneSchema.topNodeType);
        Debug.assert(target.type === PaneSchema.topNodeType);
        Debug.assert(source.childCount === target.childCount);

        this.source = $state(source);
        this.target = $state(target);
    }

    static fromTestClusters(s: string[]) {
        return new DocumentContext(
            PaneSchema.nodes.doc.createChecked({}, s.map((x, index) =>
                PaneSchema.nodes.cluster.createChecked({ index },
                    PaneSchema.nodes.block.createChecked({}, PaneSchema.text(x.trim()))))),
            PaneSchema.nodes.doc.createChecked({}, s.map((x, index) =>
                PaneSchema.nodes.cluster.createChecked({ index },
                    PaneSchema.nodes.block.createChecked({}, PaneSchema.text('?')))))
        );
    }
}
