import { Schema } from "prosemirror-model";

export const BlockSchema = new Schema({
    topNode: 'block',
    nodes: {
        text: {
            code: true,
            inline: true
        },
        block: {
            code: true,
            content: "text*",
            marks: "_"
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
