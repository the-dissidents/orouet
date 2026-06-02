import { DOMParser, Fragment, Node, Schema } from "prosemirror-model";
import type { TypedNode } from "./details/TypedNode";

export type IdBaseType = string;
export type Id = IdBaseType & { __brand: 'id' };

export type Block = TypedNode<Node, { id: Id,  }>;
export type Cluster = TypedNode<Block, { id: Id,  }>;
export type Doc = TypedNode<Cluster>;

export function isBlock(x: Node): x is Block {
    return x.type === PaneSchema.nodes.block;
}

export function isCluster(x: Node): x is Cluster {
    return x.type === PaneSchema.nodes.cluster;
}

export function isDoc(x: Node): x is Doc {
    return x.type === PaneSchema.topNodeType;
}

export function id(base: IdBaseType = crypto.randomUUID()) {
    return base as Id;
}

export function makeBlock(id: Id, content: Fragment | Node | readonly Node[]) {
    return PaneSchema.nodes.block.createChecked({ id }, content) as Block;
}

export function makeCluster(id: Id, content: Block[]) {
    return PaneSchema.nodes.cluster.createChecked({ id }, content) as Cluster;
}

export function makeDoc(content: Cluster[]) {
    const doc = PaneSchema.nodes.doc.createChecked({}, content) as Doc;
    updateDocIndex(doc);
    return doc;
}

export function updateDocIndex(doc: Doc) {
    // let block_i = 0;
    // doc.forEach((n, _, i) => {
    //     n.attrs.index = i;
    //     n.forEach((n) => n.attrs.index = block_i++);
    // });
}

export const PaneSchema = new Schema({
    nodes: {
        text: {
            code: true,
            inline: true,
        },
        block: {
            code: true,
            content: "text*",
            marks: "_",
            attrs: {
                id: { default: -1, validate: 'number' },
                // index: { validate: 'number' },
            },
            parseDOM: [{ tag: 'div.block' }, { tag: 'p' }],
            toDOM: () => ['div', {'class': 'block'}, 0],
        },
        cluster: {
            content: "block+",
            attrs: {
                id: { default: -1, validate: 'number' },
                index: { default: undefined, validate: 'number' },
            },
            parseDOM: [{ tag: 'div.cluster' }],
            toDOM: () => ['div', {'class': 'cluster'}, 0],
        },
        doc: {
            content: "cluster*"
        }
    },
    marks: {
        emphasis: {
            parseDOM: [{ tag: 'i' }, { tag: 'em' }],
            toDOM: () => ['em', 0]
        },
        keyword: {
            parseDOM: [{ tag: 'b' }, { tag: 'strong' }],
            toDOM: () => ['strong', 0]
        },
    }
});

export const SchemaDOMParser = DOMParser.fromSchema(PaneSchema);
