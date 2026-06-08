import { DOMParser, Fragment, Node, ResolvedPos, Schema } from "prosemirror-model";
import type { TypedNode } from "./details/TypedNode";
import { findParentNodeClosestToPos, findParentNodeOfType, findParentNodeOfTypeClosestToPos } from "prosemirror-utils";
import * as z from "zod/v4-mini";
import { Debug } from "./details/Util";

export type IdBaseType = string;
export type Id<T> = IdBaseType & { __brand: 'id', __for: T };

export function Id<T>() {
    return z.custom<Id<T>>((x) => typeof x === 'string');
}

export type Block = TypedNode<Node, { }>;
export type Cluster = TypedNode<Block, { }>;
export type Doc = TypedNode<Cluster>;

export const Doc = z.codec(z.any(), z.custom<Doc>(), {
    decode: (v, cxt) => {
        const n = Node.fromJSON(PaneSchema, v);
        if (isDoc(n)) return n;
        cxt.issues.push({
            code: 'invalid_format',
            format: 'ProseMirror Doc',
            input: v
        });
        return z.NEVER;
    },
    encode: (v) => v.toJSON()
});

export function isBlock(x: Node): x is Block {
    return x.type === PaneSchema.nodes.block;
}

export function isCluster(x: Node): x is Cluster {
    return x.type === PaneSchema.nodes.cluster;
}

export function isDoc(x: Node): x is Doc {
    return x.type === PaneSchema.topNodeType;
}

export function id<T>(base: IdBaseType = crypto.randomUUID()) {
    return base as Id<T>;
}

export function makeBlock(content: Fragment | Node | readonly Node[]) {
    return PaneSchema.nodes.block.createChecked({ }, content) as Block;
}

export function makeCluster(content: Block[]) {
    return PaneSchema.nodes.cluster.createChecked({ }, content) as Cluster;
}

export function makeDoc(content: Cluster[]) {
    const doc = PaneSchema.nodes.doc.createChecked({ }, content) as Doc;
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
                // id: { default: -1, validate: 'number' },
                // index: { validate: 'number' },
            },
            parseDOM: [{ tag: 'p' }],
            toDOM: () => ['p', 0],
        },
        cluster: {
            content: "block+",
            attrs: {
                // id: { default: -1, validate: 'number' },
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

export const columnPosition = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.parentOffset;
}

export const blockIndex = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.index(1);
}

export const blockOf = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.node(2);
}

export const clusterIndex = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.index(0);
}

export const clusterOf = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.node(1);
}
