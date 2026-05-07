import { id, makeBlock, PaneSchema, SchemaDOMParser, type Block } from "$lib/Schema";
import { chainCommands, deleteSelection } from "prosemirror-commands";
import { DOMParser, Fragment, Slice } from "prosemirror-model";
import { Plugin, TextSelection, type Command } from "prosemirror-state";

const gotoNextBlock: Command = (s, d) => {
    const head = s.selection.$head;

    if (head.parentOffset < head.parent.content.size || !d) return false;

    let foundPos: number | undefined;
    s.doc.nodesBetween(head.pos + 1, s.doc.content.size, (n, p) => {
        if (n.type === PaneSchema.nodes.block) foundPos = p;
        return foundPos === undefined;
    });
    if (foundPos === undefined) return false;

    const sel = TextSelection.findFrom(s.doc.resolve(foundPos), 1, true);
    if (!sel) return false;

    d(s.tr.setSelection(sel).scrollIntoView());
    return true;
}

export const userEnter = chainCommands(deleteSelection, gotoNextBlock);

const domParser = new globalThis.DOMParser();

function parseClipboard(data: DataTransfer) {
    const html = data.getData('text/html');
    if (html) {
        const doc = domParser.parseFromString(html, 'text/html');
        return SchemaDOMParser.parseSlice(doc);
    }

    const text = data.getData('text/plain').trim();
    if (text.length == 0) return Slice.empty;

    if (!text.includes('\n')) {
        // simple text
        return new Slice(Fragment.from(PaneSchema.text(text)), 0, 0);
    }

    const singleNewlines = text.matchAll(/([^\n]|^)\n([^\n]|$)/).toArray().length;
    const doubleNewlines = text.matchAll(/\n\n+/).toArray().length;

    if (doubleNewlines == 0) {
        const paras = text.split(/\n\n+/)
        return new Slice(Fragment.from(paras.map(
            (x) => makeBlock(id(), PaneSchema.text(x)))), 1, 1);
    } else {
        const paras = text.split(/\n/)
        return new Slice(Fragment.from(paras.map(
            (x) => makeBlock(id(), PaneSchema.text(x)))), 1, 1);
    }

    // TODO: import text dialog
}

export const pasteHandler = new Plugin({
    props: {
        handlePaste(view, event, _slice) {
            if (!event.clipboardData) return false;

            // we don't use the `slice` parameter as it's somehow parsed incorrectly
            const slice = parseClipboard(event.clipboardData);
            if (slice.size == 0) return true;

            const newState = view.state.apply(view.state.tr.deleteSelection());

            const type = slice.content.child(0).type;
            if (type == PaneSchema.nodes.block) {
                let pos = newState.selection.head;
                let doc = newState.doc;
                let hasContent = false;
                for (const child of slice.content.content) {
                    let ok = false;
                    doc.nodesBetween(pos, newState.doc.content.size, (n, p) => {
                        if (ok) return false;
                        if (n.type !== PaneSchema.nodes.block) return;
                        if (n.textContent.length > 0) hasContent = true;
                        doc = doc.replace(p, p + n.nodeSize, new Slice(child.content, 2, 2));
                        ok = true;
                    });
                    if (!ok) {
                        console.log('not enough block to paste all');
                        break;
                    }
                }
                if (hasContent) {
                    console.log('overwriting existing content');
                }

                // view.dispatch(view.state.tr.deleteSelection().repl)
            }

            return true;
        },
    }
})
