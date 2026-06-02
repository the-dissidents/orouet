import { id, makeBlock, PaneSchema, SchemaDOMParser, type Block, type Cluster, type Doc } from "$lib/Schema";
import { Fragment, Slice } from "prosemirror-model";
import { Plugin, TextSelection, type Command } from "prosemirror-state";
import { canJoin, joinPoint } from "prosemirror-transform";

export const splitBlock: Command = (s, d) => {
    const head = s.selection.$head;
    const tr = s.tr.split(head.pos, undefined, [{
        type: PaneSchema.nodes.block,
        attrs: { id: id() }
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

const domParser = new globalThis.DOMParser();

function parseClipboard(data: DataTransfer) {
    const html = data.getData('text/html');
    if (html) {
        const doc = domParser.parseFromString(html, 'text/html');
        const parsed = SchemaDOMParser.parse(doc) as Doc;

        if (parsed.childCount == 0) return Slice.empty;
        if (parsed.childCount == 1) {
            // one single cluster
            const cluster = parsed.child(0);
            if (cluster.childCount == 0) return Slice.empty;
            if (cluster.childCount == 1) {
                const block = cluster.child(0);
                return new Slice(Fragment.from(block.content), 3, 3);
            }
            return new Slice(cluster.content, 2, 2);
        }
        // multiple clusters
        return new Slice(parsed.content, 1, 1);
    }

    const text = data.getData('text/plain').trim();
    if (text.length == 0) return Slice.empty;

    if (!text.includes('\n')) {
        // simple text
        return new Slice(Fragment.from(PaneSchema.text(text)), 3, 3);
    }

    const doubleNewlines = [...text.matchAll(/\n\n+/g)].length;
    if (doubleNewlines > 0) {
        const paras = text.split(/\n\n+/)
        return new Slice(Fragment.from(paras.map(
            (x) => makeBlock(id(), PaneSchema.text(x.trim())))), 2, 2);
    } else {
        const paras = text.split(/\n/)
        return new Slice(Fragment.from(paras.map(
            (x) => makeBlock(id(), PaneSchema.text(x.trim())))), 2, 2);
    }
}

export const pasteHandler = new Plugin({
    props: {
        handlePaste(view, event, _slice) {
            if (!event.clipboardData) return false;

            // we don't use the `slice` parameter as it's somehow parsed incorrectly
            const slice = parseClipboard(event.clipboardData);
            if (slice.size == 0) return true;
            console.log(slice);

            const tr = view.state.tr.deleteSelection();
            const type = slice.content.firstChild!.type;
            console.log('type of clipboard content:', type.name);

            if (type === PaneSchema.nodes.block) {
                let pos = tr.selection.head;
                let hasContent = false;
                for (const child of slice.content.content) {
                    console.log('type of child node:', child.type.name);
                    let ok = false;
                    tr.doc.nodesBetween(pos, tr.doc.content.size, (n, p) => {
                        if (ok) return false;
                        if (n.type !== PaneSchema.nodes.block) return;
                        console.log('found block child node at', p);
                        if (n.textContent.length > 0) hasContent = true;
                        tr.replaceWith(p, p + n.nodeSize, child);
                        ok = true;
                    });
                    if (!ok) break;
                    console.log('pos', pos, '->', tr.selection.head);
                    pos = tr.selection.head;
                }

                const sel = TextSelection.near(tr.doc.resolve(pos));
                if (sel) tr.setSelection(sel);
            } else {
                tr.replaceSelection(slice);
            }

            view.dispatch(tr.scrollIntoView());
            return true;
        },
    }
})
