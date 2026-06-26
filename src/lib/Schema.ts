import { DOMParser, Fragment, Node, ResolvedPos, Schema } from "prosemirror-model";
import type { TypedNode } from "./details/TypedNode";
import * as z from "zod/v4-mini";
import { Debug } from "./details/Util";

export type IdBaseType = string;
export type Id<T> = IdBaseType & { __brand: 'id', __for: T };

export function Id<T>() {
    return z.custom<Id<T>>((x) => typeof x === 'string');
}

const ClusterKinds = ['text', 'blockquote', 'h1', 'h2', 'h3'] as const;
export type ClusterKind = (typeof ClusterKinds)[number];

export type Block = TypedNode<Node, { }>;
export type Cluster = TypedNode<Block, { kind: ClusterKind, id: Id<Cluster> }>;
export type Doc = TypedNode<Cluster>;

export const Doc = z.codec(z.unknown(), z.custom<Doc>(), {
    decode: (v, cxt) => {
        const n = Node.fromJSON(PaneSchema, v);
        if (isDoc(n)) return n;
        cxt.issues.push({
            code: 'invalid_format',
            format: 'ProseMirror Doc',
            input: `...`
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

export function makeCluster(content: Block[], kind: ClusterKind, _id = id<Cluster>()) {
    return PaneSchema.nodes.cluster.createChecked({ kind, id: _id }, content) as Cluster;
}

export function makeDoc(content: Cluster[]) {
    const doc = PaneSchema.nodes.doc.createChecked({ }, content) as Doc;
    return doc;
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
            attrs: { },
            parseDOM: [{ tag: 'p' }],
            toDOM: () => ['p', 0],
        },
        cluster: {
            content: "block+",
            attrs: {
                id: { validate: (x) => typeof x == 'string' },
                kind: { validate: (x) => ClusterKinds.includes(x) },
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
};

export const blockIndex = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.index(1);
};

export const blockOf = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.node(2) as Block;
};

export const clusterIndex = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.index(0);
};

export const clusterOf = (pos: ResolvedPos) => {
    Debug.assert(pos.depth == 2);
    return pos.node(1) as Cluster;
};
