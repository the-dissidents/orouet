import type { DocumentContext, LocaleId } from "$lib/DocumentContext.svelte";
import { getInterlacedRepresentation } from "$lib/component/chat/DocRepresentation";
import { getLocale } from "$lib/paraglide/runtime";
import { Cluster, ClusterKinds, id, parseDOMCluster, type ClusterKind, Id, Doc } from "$lib/Schema";
import { Transform } from "prosemirror-transform";
import type { Transforms } from "$lib/VersionControl.svelte";
import type { Fragment } from "prosemirror-model";

function localeCode(id: LocaleId) {
    return id.filter((x) => !!x).join('-') || 'not specified';
}

export function getSystemPrompt(ctx: DocumentContext) {
    return `
You are an expert literary translation assistant embedded directly within the translation application "Orouët". Your primary goal is to help the human translator achieve high-quality, structurally accurate, and stylistically resonant literary translations.

Source locale: ${localeCode(ctx.source.language)}
Target locale: ${localeCode(ctx.target.language)}
Default UI locale: ${getLocale()}

# Interaction Rules

1. Language Mirroring
    1.1. The *UI locale* is \`${getLocale()}\`. This is just a hint. You must detect the language of the user's chat input and write your RESPONSE in that exact language.
    1.2. The *target locale* is \`${localeCode(ctx.target.language)}\`. You must output your TRANSLATION in this locale. In rare cases the user might forget to set it to a correct one, you must ASK them for clarification.
2. Conversational Brevity: Be concise and academic. Do not offer unsolicited compliments. Focus strictly on linguistic nuance, syntactic structures, and semantic accuracy.
3. Literary Focus: Pay close attention to literary features such as rhythm, parataxis vs. hypotaxis, as well as the historical context of the prose.

# Formatting

- Do not output Markdown formatting (like **bold** or _italics_) when suggesting text modifications. The application uses a strict XML format to represent documents.
- The document is split into <oro-cluster>'s that contain aligned pairs of <oro-source> and <oro-target> (i.e. original and translated text).
- Each cluster has a persistent UUID and a kind. Available kinds: text, blockquote, h1 ... h6
- A cluster can potentially be split into multiple paragraphs (<p>) in case the paragraph layout needs to be changed.
- You can use the following inline formatting: emphasis (<em>), keyword (<strong>)

Content of the current working document:

${getInterlacedRepresentation({
    source: ctx.source.content,
    target: ctx.target.content
})}

IMPORTANT: This is the LATEST state of the document. It contains all changes made by the user and you during the coversation and is NOT the original state before the conversation starts.

# Action Directives

When the user asks you to modify the text, you MUST output your action in code fences:

\`\`\`{{command}}
{{XML fragment}}
\`\`\`

Note that if the content contains backticks, the opening and ending fences can be arbitrarily lengthened, but the lengths must match.

Currently available commands:
- \`replace_clusters\`: Accepts any number of <oro-cluster>s. The UUID MUST match the original in the documents. In each cluster, one of <oro-source> and <oro-target> MAY be omitted if not modified.

Example:

\`\`\`replace_clusters
<oro-cluster id="..." kind="...">
<oro-target>
<p>Modified paragraphs</p>
<p>Modified paragraphs</p>
</oro-target>
</oro-cluster>
<oro-cluster id="..." kind="...">
<oro-target>
<p>Modified paragraph in another cluster</p>
</oro-target>
</oro-cluster>
\`\`\`

\`\`\`replace_phrase
<replace-term>
\`\`\`

Fenced commands are detected and executed only after your message turn ends. If commands are detected, a system message will be generated containing the execution results (OK or error), available for your next turn.

To prevent hallucination harm, if any command call contains any error, not only the bad part will not be executed, but your command calls will be entirely discarded.

# Instruction Adherence

You MUST NOT modify the document unless explicitly instructed. If you are only discussing theory, defining a word, or brainstorming -- not executing a change -- respond normally in the chat using standard text.

If something is outside your knowledge (e.g. information about how Orouët itself works), reply that you are an external LLM and you don't know.

If an instruction is unclear, you MUST ask the user about it and stop.
`.trim();
}

export type FencedCommandError = {
    type: 'invalid_id',
    id: string
} | {
    type: 'syntax_error'
    msg: string
} | {
    type: 'invalid_command'
};

export type FencedCommandResultData = {
    errors: FencedCommandError[],
    transforms: undefined,
} | {
    errors: [],
    transforms: Transforms
};

function replaceCluster(
    tr: Transform, id: Id<Cluster>, content: Fragment
): FencedCommandError | void {
    const src = Cluster.findById(tr.doc as Doc, id);
    if (!src) return { type: 'invalid_id', id };
    const [c, pos] = src;
    tr.replaceWith(pos + 1, pos + 1 + c.content.size, content);
}

function setClusterKind(
    tr: Transform, id: Id<Cluster>, kind: ClusterKind
): FencedCommandError | void {
    const src = Cluster.findById(tr.doc as Doc, id);
    if (!src) return { type: 'invalid_id', id };
    const [c, pos] = src;
    if (c.attrs.kind !== kind)
        tr.setNodeAttribute(pos, 'kind', kind);
}

function doReplaceClusters(xml: string, tr: Transforms): FencedCommandResultData {
    const parser = new DOMParser();
    const doc: Element =
        parser.parseFromString(`<root>${xml}</root>`, "application/xml").children[0];

    const syntaxError = (msg: string): FencedCommandResultData => ({
        errors: [{ type: 'syntax_error', msg }], transforms: undefined
    });

    const error = (e: FencedCommandError): FencedCommandResultData => ({
        errors: [e], transforms: undefined
    });

    if (!doc || doc.querySelector("parsererror")) {
        console.log(doc);
        return syntaxError('parse error');
    }

    for (const c of doc.children) {
        if (c.tagName.toLowerCase() !== 'oro-cluster')
            return syntaxError(`expected oro-cluster, found '${c.tagName}'`);
        const clusterId = id<Cluster>(c.getAttribute('id') ?? '');
        if (!clusterId) return error({ type: 'invalid_id', id: clusterId });

        let e: FencedCommandError | void;

        const kind = c.getAttribute('kind');
        if (kind) {
            const k = kind as ClusterKind;
            if (!ClusterKinds.includes(k))
                return syntaxError(`invalid cluster kind '${c.tagName}'`);
            if (e = setClusterKind(tr.source, clusterId, k)) return error(e);
            if (e = setClusterKind(tr.target, clusterId, k)) return error(e);
        }

        for (const side of c.children) {
            const name = side.tagName.toLowerCase();
            const content = parseDOMCluster(side, 'text').at(0)?.content;
            if (!content) return syntaxError(`cluster must contain at least one block`);
            if (name == 'oro-source') {
                if (e = replaceCluster(tr.source, clusterId, content)) return error(e);
            } else if (name == 'oro-target') {
                if (e = replaceCluster(tr.target, clusterId, content)) return error(e);
            } else return syntaxError(`expected oro-source or oro-target, found '${name}'`);
        }
    }

    return { errors: [], transforms: tr };
}

export type FencedCommandResult = {
    cleanedMessage: string,
    commands: { index: number, name: string, code: string, errors: FencedCommandError[] }[],
    system?: string,
    transforms?: Transforms
};

export function parseFencedCommands(msg: string, ctx: DocumentContext): FencedCommandResult {
    const regex = /^(`+)(.+)\n((?:.|\n)+)\n\1$/gm;
    const ret: FencedCommandResult = {
        cleanedMessage: '', commands: [], system: undefined,
        transforms: undefined,
    };
    let tr = {
        source: new Transform(ctx.source.content),
        target: new Transform(ctx.target.content)
    };

    let index = 0, hasError = false;
    ret.cleanedMessage = msg.replaceAll(regex, (code, _, name, content) => {
        let replacement = '';
        if (name == 'replace_clusters') {
            const result = doReplaceClusters(content, tr);
            ret.commands.push({ index, name, code, errors: result.errors });
            if (!result.transforms)
                hasError = true;
            else tr = result.transforms;

            index++;
        } else {
            replacement = code;
        }
        return replacement;
    });

    if (index > 0) {
        ret.system = ret.commands.map((x, i) => `[${i}] ${x.name}: ${x.errors.length > 0 ? JSON.stringify(x.errors) : 'ok'}`).join('\n');
        ret.transforms = hasError ? undefined : tr;
    }
    return ret;
}
