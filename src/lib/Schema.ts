import { Schema } from "prosemirror-model";

export const DocumentSchema = new Schema({
    topNode: 'block',
    nodes: {
        text: {
            code: true,
            inline: true
        },
        block: {
            code: true,
            content: "text*",
            marks: "_",
            toDOM: () => ['div', {'class': 'block'}, 0]
        },
        source: {
            content: "block*",
            toDOM: () => ['div', {'class': 'source'}, 0]
        },
        target: {
            content: "block*",
            toDOM: () => ['div', {'class': 'target'}, 0]
        },
        cluster: {
            content: "source target",
            attrs: {
                index: { validate: 'number' }
            },
            toDOM: () => ['div', {'class': 'cluster'}, 0]
        },
        doc: {
            content: "cluster*"
        }
    },
    marks: {
        bold: {
            parseDOM: [{ tag: 'b' }],
            toDOM: () => ['b', 0]
        },
        italic: {
            parseDOM: [{ tag: 'i' }, { tag: 'em' }],
            toDOM: () => ['i', 0]
        },
        underline: {
            parseDOM: [{ tag: 'u' }],
            toDOM: () => ['u', 0]
        },
        strikethrough: {
            parseDOM: [{ tag: 's' }],
            toDOM: () => ['s', 0]
        },
    }
});
