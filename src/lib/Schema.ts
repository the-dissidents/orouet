import { Schema } from "prosemirror-model";

export const PaneSchema = new Schema({
    nodes: {
        text: {
            code: true,
            inline: true
        },
        block: {
            code: true,
            content: "text*",
            marks: "_",
            attrs: {
                id: { default: -1, validate: 'number' },
                // index: { validate: 'number' },
            },
            toDOM: () => ['div', {'class': 'block'}, 0],
        },
        cluster: {
            content: "block*",
            attrs: {
                id: { default: -1, validate: 'number' },
                index: { validate: 'number' },
            },
            toDOM: () => ['div', {'class': 'cluster'}, 0],
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
