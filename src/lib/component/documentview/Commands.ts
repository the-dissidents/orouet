import { BoundaryCondition, isBoundary } from "$lib/Boundary";
import type { DocumentContext } from "$lib/DocumentContext.svelte";
import { makeBlock, PaneSchema, parseDOMCluster, parseDOMDoc, type Doc } from "$lib/Schema";
import { Fragment, Slice } from "prosemirror-model";
import { Plugin, TextSelection, type Command } from "prosemirror-state";

export const splitBlock: Command = (s, d) => {
    const head = s.selection.$head;
    const tr = s.tr.split(head.pos, undefined, [{
        type: PaneSchema.nodes.block,
        attrs: { }
    }]);
    d?.(tr.scrollIntoView());
    return true;
}

export const mergeBlockUpIfAtStart: Command = (s, d) => {
    const head = s.selection.$head;
    if (head.parentOffset > 0 || head.index(head.depth-1) == 0 || !d) return false;
    const tr = s.tr.delete(head.pos - 2, head.pos);
    d?.(tr.scrollIntoView());
    return true;
}

export const testCommand: Command = (s, d) => {
    const head = s.selection.$head;
    console.log(head, head.depth, head.index(head.depth-1), head.nodeBefore, head.nodeAfter);
    return false;
}

export const gotoPrevBlockIfAtStart: Command = (s, d) => {
    const head = s.selection.$head;
    if (head.parentOffset > 0) return false;

    const sel = TextSelection.near(s.doc.resolve(head.pos - 1), -1);
    if (!sel) return false;

    d?.(s.tr.setSelection(sel).scrollIntoView());
    return true;
}

export const gotoNextBlockIfAtEnd: Command = (s, d) => {
    const head = s.selection.$head;
    if (head.parentOffset < head.parent.content.size) return false;

    const sel = TextSelection.near(s.doc.resolve(head.pos + 1));
    if (!sel) return false;

    d?.(s.tr.setSelection(sel).scrollIntoView());
    return true;
}

const historyBoundary: BoundaryCondition = {
    delay: 1000,
    hasLabel: true
};

export const undo: (dc: DocumentContext) => Command = (dc) => () => {
    let id = dc.currentCommitId;
    do {
        const c = dc.versionControl.get(id);
        if (!c || c.type != 'delta') break;
        id = c.parent;
    } while (!isBoundary(dc.versionControl, id, 'backward', historyBoundary));
    dc.revertTo(id);
    return true;
};

export const redo: (dc: DocumentContext) => Command = (dc) => () => {
    let id = dc.currentCommitId;
    do {
        const c = dc.versionControl.forwardLinks(dc.currentCommitId);
        if (c.length != 1) return false;
        id = c[0];
    } while (!isBoundary(dc.versionControl, id, 'forward', historyBoundary));
    dc.revertTo(id);
    return true;
};

function parseHTML(html: string) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content;
}

function parseClipboard(data: DataTransfer): Fragment {
    const html = data.getData('text/html');
    if (html) {
        const parsed = parseDOMDoc(parseHTML(html));
        console.log(parsed);

        if (parsed.childCount == 0) return Fragment.empty;
        if (parsed.childCount == 1) {
            // one single cluster
            const cluster = parsed.child(0);
            if (cluster.childCount == 0) return Fragment.empty;
            if (cluster.childCount == 1) {
                const block = cluster.child(0);
                return Fragment.from(block.content);
            }
            return cluster.content;
        }
        // multiple clusters
        return parsed.content;
    }

    const text = data.getData('text/plain').trim();
    if (text.length == 0) return Fragment.empty;

    if (!text.includes('\n')) {
        // simple text
        return Fragment.from(PaneSchema.text(text));
    }

    const doubleNewlines = [...text.matchAll(/\n\n+/g)].length;
    if (doubleNewlines > 0) {
        const paras = text.split(/\n\n+/)
        return Fragment.from(paras.map(
            (x) => makeBlock(PaneSchema.text(x.trim()))));
    } else {
        const paras = text.split(/\n/)
        return Fragment.from(paras.map(
            (x) => makeBlock(PaneSchema.text(x.trim()))));
    }
}

export const pasteHandler = new Plugin({
    props: {
        handlePaste(view, event, _slice) {
            if (!event.clipboardData) return false;

            const frag = parseClipboard(event.clipboardData);
            if (frag.size == 0) return true;
            console.log(frag);

            const tr = view.state.tr.deleteSelection();
            const type = frag.firstChild!.type;
            console.log('type of clipboard content:', type.name);

            if (type === PaneSchema.nodes.cluster) {
                let pos = tr.selection.head;
                let hasContent = false;
                for (const cl of frag.content) {
                    // console.log('searching between', pos, tr.doc.content.size);
                    let found = false;
                    tr.doc.nodesBetween(pos, tr.doc.content.size, (n, p) => {
                        if (found || p < pos - 2) return false;
                        if (n.type !== PaneSchema.nodes.cluster) return;
                        // console.log('found', p, n.nodeSize, p + n.nodeSize);
                        if (n.textContent.length > 0) hasContent = true;
                        tr.replaceWith(p, p + n.nodeSize, cl);
                        found = true;
                    });
                    if (!found) break;
                    // console.log('pos', pos, '->', tr.selection.head, tr.selection.$head.end());

                    pos = tr.selection.head;
                }

                const sel = TextSelection.near(tr.doc.resolve(pos));
                if (sel) tr.setSelection(sel);
            } else {
                tr.replaceSelection(new Slice(frag, 0, 0));
            }

            view.dispatch(tr.scrollIntoView());
            return true;
        },
    }
})
