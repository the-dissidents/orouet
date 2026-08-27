import { Fragment, Mark, Node, ResolvedPos, Schema } from "prosemirror-model";
import type { TypedNode } from "./details/TypedNode";
import * as z from "zod/v4-mini";

export type IdBaseType = string;
export type Id<T> = IdBaseType & { __brand: 'id', __for: T };

export function Id<T>() {
    return z.custom<Id<T>>((x) => typeof x === 'string');
}

const ClusterKindCategory = {
    heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    common: ['text', 'blockquote', 'poetry'], // TODO: poetry inside blockquote how?
    theaterInterview: ['speaker', 'stage-direction']
} as const;

export const ClusterKindCategories =
    Object.keys(ClusterKindCategory) as (keyof typeof ClusterKindCategory)[];
export const ClusterKinds = Object.values(ClusterKindCategory).flat();
export type ClusterKind = (typeof ClusterKindCategory)[keyof typeof ClusterKindCategory][number];

export const ClusterKind = {
    categoryOf(k: ClusterKind) {
        return Object.entries(ClusterKindCategory).find(([_, x]) => x.includes(k as never))![0];
    },
    category(cat: keyof typeof ClusterKindCategory) {
        return ClusterKindCategory[cat];
    },
}

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

export function makeCluster(content: readonly Block[], kind: ClusterKind, _id = id<Cluster>()) {
    return PaneSchema.nodes.cluster.createChecked({ kind, id: _id }, content) as Cluster;
}

export function makeClusterUnchecked(
    content: readonly  Block[], kind: ClusterKind, _id = id<Cluster>()
) {
    return PaneSchema.nodes.cluster.create({ kind, id: _id }, content) as Cluster;
}

export function makeDoc(content: readonly  Cluster[]) {
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

export const parseDOMDoc = (dom: Element | DocumentFragment): Doc => {
    console.log(dom);

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

    return makeDoc(parseDOMSingleClusters(dom));
};

// parse like a single cluster but then make each block a new cluster
const parseDOMSingleClusters = (dom: Element | DocumentFragment): Cluster[] => {
    const content: Cluster[] = [];

    function walk(e: Element | DocumentFragment) {
        if (e instanceof Element) {
            let ok = false;
            ([
                ['p', 'text'],
                ['blockquote', 'blockquote'],
                ['h1', 'h1'], ['h2', 'h2'], ['h3', 'h3'],
                ['h4', 'h4'], ['h5', 'h5'], ['h6', 'h6']
            ] as const).forEach(([a, b]) => {
                if (ok || !e.matches(a)) return;
                content.push(makeCluster([parseDOMBlock(e)], b));
                ok = true;
            })
            if (ok) return;
        }
        [...e.children].forEach((c) => walk(c));
    }
    walk(dom);

    if (content.length == 0) {
        // attempt to treat the whole as inline
        content.push(makeCluster([parseDOMBlock(dom)], 'text'));
    }
    return content;
};

export const parseDOMCluster = (dom: Element | DocumentFragment, kind: ClusterKind): [Cluster] | [] => {
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

export const parseDOMBlock = (dom: Element | DocumentFragment): Block => {
    const content: Node[] = [];
    function walk(n: globalThis.Node, marks: Mark[] = []) {
        if (n instanceof Text && n.nodeValue)
            content.push(PaneSchema.text(n.nodeValue, marks));
        if (n instanceof Element) {
            switch (n.tagName.toLowerCase()) {
            case 'em': case 'i':
                marks.push(PaneSchema.marks.emphasis.create()); break;
            case 'strong': case 'b':
                marks.push(PaneSchema.marks.strong.create()); break;
            }
        }
        n.childNodes.forEach((c) => walk(c, [...marks]));
    }
    walk(dom);
    return makeBlock(content);
}

export const columnPosition = (pos: ResolvedPos) => {
    if (pos.depth !== 2) return null;
    return pos.parentOffset;
};

export const Block = {
    indexFromPos(pos: ResolvedPos) {
        if (pos.depth !== 2) return null;
        return pos.index(1);
    },
    fromPos(pos: ResolvedPos) {
        if (pos.depth !== 2) return null;
        return pos.node(2) as Block;
    },
}

export const Cluster = {
    indexFromPos(pos: ResolvedPos) {
        if (pos.depth !== 2) return null;
        return pos.index(0);
    },
    fromPos(pos: ResolvedPos) {
        if (pos.depth !== 2) return null;
        return pos.node(1) as Cluster;
    },
    findById(doc: Doc, id: Id<Cluster>): [cl: Cluster, pos: number] | null {
        let result: [Cluster, number] | null = null;
        doc.forEach((n, pos) => {
            if (n.attrs.id == id) result = [n, pos];
        });
        return result;
    },
    findByIndex(doc: Doc, i: number): [cl: Cluster, pos: number] | null {
        let result: [Cluster, number] | null = null;
        doc.forEach((n, pos, i1) => {
            if (i == i1) result = [n, pos];
        });
        return result;
    },
}
