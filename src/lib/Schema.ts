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

export type Pointer<T> = [node: T, pos: number];

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

// Elements whose computed `display` marks them as inline (or transparent); anything
// else forms a paragraph boundary. Used when the element is attached to a live
// document so getComputedStyle resolves real styles.
const INLINE_DISPLAYS = new Set([
    'inline', 'inline-block', 'inline-flex', 'inline-grid', 'inline-table',
    'ruby', 'ruby-text', 'contents',
]);

// Fallback for detached DOM (pasted/XML-parsed fragments), where getComputedStyle
// returns nothing: the standard block-level tags.
const BLOCK_LEVEL_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 'center', 'dd', 'details',
    'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer',
    'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
    'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tfoot', 'ul',
]);

const isBlockElement = (el: Element): boolean => {
    const display = getComputedStyle(el).display;
    if (display) return !INLINE_DISPLAYS.has(display);
    return BLOCK_LEVEL_TAGS.has(el.tagName.toLowerCase());
};

const clusterKindOf = (tagName: string): ClusterKind => {
    switch (tagName.toLowerCase()) {
    case 'blockquote': return 'blockquote';
    case 'h1': case 'h2': case 'h3':
    case 'h4': case 'h5': case 'h6':
        return tagName.toLowerCase() as ClusterKind;
    default: return 'text';
    }
};

// blockquote and headings keep all their (possibly multi-paragraph) content as a
// single block, matching how they are represented as a single cluster.
const isAtomicBlock = (el: Element): boolean => {
    const tag = el.tagName.toLowerCase();
    return tag === 'blockquote' || /^h[1-6]$/.test(tag);
};

type BlockSource = { nodes: globalThis.Node[], kind: ClusterKind };

// Segment a container into paragraphs. Consecutive text/inline nodes accumulate into
// one block; each block-level element (by computed display, or tag fallback) starts a
// new block. This handles old webpages where text is not wrapped in <p> consistently.
const segmentBlocks = (container: globalThis.Node, defaultKind: ClusterKind): BlockSource[] => {
    const blocks: BlockSource[] = [];
    let inline: globalThis.Node[] = [];

    const flush = (kind: ClusterKind) => {
        if (inline.length > 0) {
            blocks.push({ nodes: inline, kind });
            inline = [];
        }
    };

    const visit = (parent: globalThis.Node, kind: ClusterKind) => {
        for (const child of parent.childNodes) {
            if (child instanceof Text) {
                if (child.nodeValue) inline.push(child);
            } else if (child instanceof Element) {
                if (isBlockElement(child)) {
                    flush(kind);
                    if (isAtomicBlock(child))
                        blocks.push({ nodes: [child], kind: clusterKindOf(child.tagName) });
                    else
                        visit(child, clusterKindOf(child.tagName));
                    flush(kind);
                } else {
                    inline.push(child);
                }
            }
        }
    };

    visit(container, defaultKind);
    flush(defaultKind);
    return blocks;
};

export const parseDOMDoc = (dom: Element | DocumentFragment): Doc => {
    console.log('parseDOMDoc:', dom);
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
const parseDOMSingleClusters = (dom: Element | DocumentFragment): Cluster[] =>
    segmentBlocks(dom, 'text').map(({ nodes, kind }) =>
        makeCluster([parseDOMBlock(nodes)], kind));

export const parseDOMCluster = (
    dom: Element | DocumentFragment, kind: ClusterKind
): [Cluster] | [] => {
    const content = segmentBlocks(dom, kind).map(({ nodes }) => parseDOMBlock(nodes));
    return content.length > 0 ? [makeCluster(content, kind)] : [];
};

export const parseDOMBlock = (dom: globalThis.Node | readonly globalThis.Node[]): Block => {
    const nodes = Array.isArray(dom) ? dom : [dom];
    const content: Node[] = [];
    function walk(n: globalThis.Node, marks: Mark[] = []) {
        if (n instanceof Text && n.nodeValue)
            content.push(PaneSchema.text(n.nodeValue, marks));
        if (n instanceof Element) {
            switch (n.tagName.toLowerCase()) {
            case 'em': case 'i':
                marks.push(PaneSchema.marks.emphasis.create()); break;
            case 'strong': case 'b':
                marks.push(PaneSchema.marks.keyword.create()); break;
            }
        }
        if (n instanceof HTMLElement) {
            if (n.style.fontStyle == 'italic') {
                marks.push(PaneSchema.marks.emphasis.create());
            } else if (['bold', '700', '800', '900'].includes(n.style.fontWeight)) {
                marks.push(PaneSchema.marks.keyword.create());
            }
        }
        n.childNodes.forEach((c) => walk(c, [...marks]));
    }
    nodes.forEach((n) => walk(n));
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
    findById(doc: Doc, id: Id<Cluster>): Pointer<Cluster> | null {
        let result: [Cluster, number] | null = null;
        doc.forEach((n, pos) => {
            if (n.attrs.id == id) result = [n, pos];
        });
        return result;
    },
    findByIdPrefix(doc: Doc, id: IdBaseType): Pointer<Cluster> | null | 'ambiguous' {
        let result: [Cluster, number] | null | 'ambiguous' = null;

        doc.forEach((n, pos) => {
            if (n.attrs.id.startsWith(id))
                result = result !== null
                    ? 'ambiguous'
                    : [n, pos];
        });
        if (!result) console.warn('not found', doc, id);
        return result;
    },
    findByIndex(doc: Doc, i: number): Pointer<Cluster> | null {
        let result: [Cluster, number] | null = null;
        doc.forEach((n, pos, i1) => {
            if (i == i1) result = [n, pos];
        });
        return result;
    },
}
