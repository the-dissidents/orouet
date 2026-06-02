import { unwrap, type Wrapped } from "$lib/details/Util";
import type { NodeType } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export const placeholder = (forType: NodeType, text: Wrapped<string>) => new Plugin({
    props: {
        decorations({ doc }) {
            const decorations: Decoration[] = [];

            doc.descendants((n, pos) => {
                if (n.type.name == forType.name && n.textContent.length == 0) {
                    decorations.push(Decoration.node(pos, pos + n.nodeSize, {
                        class: 'placeholder',
                        'data-placeholder-text': unwrap(text)
                    }));
                }
            });
            return DecorationSet.create(doc, decorations);
        },
    }
});
