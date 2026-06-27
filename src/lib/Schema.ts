import { DOMParser, Fragment, Mark, Node, ResolvedPos, Schema } from "prosemirror-model";
import type { TypedNode } from "./details/TypedNode";
import * as z from "zod/v4-mini";
import { Debug } from "./details/Util";
import { Transform } from "prosemirror-transform";

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

export function makeClusterUnchecked(content: Block[], kind: ClusterKind, _id = id<Cluster>()) {
    return PaneSchema.nodes.cluster.create({ kind, id: _id }, content) as Cluster;
}

export function makeDoc(content: Cluster[]) {
    const doc = PaneSchema.nodes.doc.createChecked({ }, content) as Doc;
    return doc;
}

export const PaneSchema = new Schema({
    nodes: {
        text: {
            code: true, // newlines allowed
            inline: true,
        },
        block: {
            code: true,
            content: "text*",
            marks: "_",
            attrs: { },
            toDOM: () => ['p', 0],
        },
        cluster: {
            content: "block+",
            attrs: {
                // allow dummy values for correctly parsing HTML
                id: { default: 'dummy', validate: (x) => typeof x == 'string' },
                kind: { default: 'text', validate: (x) => ClusterKinds.includes(x) },
            },
            toDOM: (node) => ['div', {
                'class': 'cluster',
                'data-kind': node.attrs.kind
            }, 0],
        },
        doc: {
            content: "cluster*"
        }
    },
    marks: {
        emphasis: {
            toDOM: () => ['em', 0]
        },
        keyword: {
            toDOM: () => ['strong', 0]
        },
    }
});

const SchemaDOMParser = DOMParser.fromSchema(PaneSchema);

export const parseDOMDoc = (dom: Element | DocumentFragment): Doc => {
    if (dom.querySelector('div.cluster[data-kind]')) {
        const content: Cluster[] = [];
        function walk(e: Element | DocumentFragment) {
            if (e instanceof Element && e.matches('div.cluster')) {
                const kind = e.getAttribute('data-kind') as ClusterKind;
                content.push(...parseDOMCluster(e, ClusterKinds.includes(kind) ? kind : 'text'));
            } else
                [...e.children].forEach((e) => walk(e));
        }
        walk(dom);
        return makeDoc(content);
    }

    // a single cluster
    return makeDoc(parseDOMCluster(dom, 'text'));
};

export const parseDOMCluster = (dom: Element | DocumentFragment, kind: ClusterKind): [Cluster] | [] => {
    console.log('parse cluster', dom);
    const content: Block[] = [];

    function walk(e: Element | DocumentFragment) {
        if (e instanceof Element && e.matches('p'))
            content.push(parseDOMBlock(e));
        else
            [...e.children].forEach((e) => walk(e));
    }
    walk(dom);
    return content.length > 0 ? [makeCluster(content, kind)] : [];
};

export const parseDOMBlock = (dom: Element): Block => {
    const content: Node[] = [];
    function walk(n: globalThis.Node, marks: Mark[] = []) {
        if (n instanceof Text && n.nodeValue)
            content.push(PaneSchema.text(n.nodeValue));
        if (n instanceof Element) {
            switch (n.tagName.toLowerCase()) {
            case 'em':
                marks.push(PaneSchema.marks.emphasis.create()); break;
            case 'strong':
                marks.push(PaneSchema.marks.strong.create()); break;
            }
            n.childNodes.forEach((c) => walk(c, [...marks]));
        }
    }
    walk(dom);
    return makeBlock(content);
}

export const columnPosition = (pos: ResolvedPos) => {
    if (pos.depth !== 2) return null;
    return pos.parentOffset;
};

export const blockIndex = (pos: ResolvedPos) => {
    if (pos.depth !== 2) return null;
    return pos.index(1);
};

export const blockOf = (pos: ResolvedPos) => {
    if (pos.depth !== 2) return null;
    return pos.node(2) as Block;
};

export const clusterIndex = (pos: ResolvedPos) => {
    if (pos.depth !== 2) return null;
    return pos.index(0);
};

export const clusterOf = (pos: ResolvedPos) => {
    if (pos.depth !== 2) return null;
    return pos.node(1) as Cluster;
};
