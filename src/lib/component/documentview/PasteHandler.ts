import { parseDOMDoc, PaneSchema, makeCluster, makeBlock, isCluster, Cluster } from "$lib/Schema";
import { Fragment, Slice } from "prosemirror-model";
import { Plugin, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

function parseHTML(html: string) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content;
}

function parseClipboard(data: DataTransfer, opts?: { forcePlaintext?: boolean }): Fragment {
    if (!opts?.forcePlaintext) {
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
        console.log('plaintext: using double newline as paragraph markers');
        return Fragment.from(paras.map(
            (x) => makeCluster([makeBlock(PaneSchema.text(x.trim()))], 'text')));
    } else {
        const paras = text.split(/\n/)
        console.log('plaintext: using single newline as paragraph markers');
        return Fragment.from(paras.map(
            (x) => makeCluster([makeBlock(PaneSchema.text(x.trim()))], 'text')));
    }
}

function doPaste(clipboardData: DataTransfer, view: EditorView, role: 'source' | 'target') {
    const frag = parseClipboard(clipboardData);
    if (frag.size == 0) return true;
    console.log(frag);

    const tr = view.state.tr.deleteSelection();
    const multipleClusters = frag.firstChild!.type === PaneSchema.nodes.cluster;

    if (role == 'source' || !multipleClusters) {
        tr.replaceSelection(multipleClusters
            ? new Slice(frag, 2, 2)
            : new Slice(frag, 0, 0));
    } else {
        // in target view, we paste multiple clusters OVER existing content

        let pos = tr.selection.head;
        let hasContent = false;
        for (const cl of frag.content) {
            let found = false;
            tr.doc.nodesBetween(pos, tr.doc.content.size, (n, p) => {
                if (found || p < pos - 2) return false;
                if (!isCluster(n)) return;
                if (n.textContent.length > 0) hasContent = true;
                const pastedCluster = cl as Cluster;
                tr.replaceWith(p, p + n.nodeSize,
                    makeCluster(pastedCluster.children, n.attrs.kind, n.attrs.id));
                found = true;
                pos = p + cl.nodeSize;
            });
            if (!found) break;
        }

        const sel = TextSelection.near(tr.doc.resolve(pos));
        if (sel) tr.setSelection(sel);
    }

    view.dispatch(tr.scrollIntoView());
}

export const pasteHandler = (role: 'source' | 'target') => new Plugin({
    props: {
        handlePaste(view, event, _slice) {
            if (!event.clipboardData) return false;
            doPaste(event.clipboardData, view, role);
            return true;
        },
    }
})
