import type { DocumentContext, LocaleId } from "$lib/DocumentContext.svelte";
import { getInterlacedRepresentation } from "$lib/component/chat/DocRepresentation";
import { getLocale } from "$lib/I18n";
import { ClusterKinds } from "$lib/Schema";
import { Transform } from "prosemirror-transform";
import type { Transforms } from "$lib/VersionControl.svelte";
import { replaceClustersCommand } from "./commands/ReplaceClusters";

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
- The document is split into <cluster>'s that contain aligned pairs of <source> and <target> (i.e. original and translated text).
- Each cluster has a persistent unique \`id\` (UUID truncated for ease of copying) and a \`kind\`. Available kinds: ${ClusterKinds.map((x) => `\`${x}\``).join(', ')}
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

Note that the opening and ending fences can be arbitrarily lengthened (in case the content contains backticks), but the lengths must match.

Currently available commands:
- \`replace_cluster(id)\`: Accepts at most one <source>, one <target> and one <kind>. Replaces the whole cluster.

Example:

\`\`\`replace_cluster(1a2b3c)
<kind>h1</kind>
\`\`\`

\`\`\`replace_cluster(1a2b3c)
<target>
<p>Modified paragraphs</p>
<p>Modified paragraphs</p>
</target>
\`\`\`

\`\`\`replace_cluster(4d5e6f)
<kind>blockquote</kind>
<source>
<p>Source modified</p>
</source>
<target>
<p>And target also</p>
</target>
\`\`\`

Fenced commands are detected and executed only after your message turn ends. If commands are detected, a system message will be generated containing the execution results (OK or error), available for your next turn.

To prevent hallucination harm, if any command call contains any error, not only the bad part will not be executed, but your command calls will be entirely discarded.

# Instruction Adherence

You MUST NOT modify the document unless explicitly instructed. If you are only discussing theory, defining a word, or brainstorming -- not executing a change -- respond normally in the chat using standard text.

If something is outside your knowledge (e.g. information about how Orouët itself works), reply that you are an external LLM and you don't know.

If an instruction is unclear, you MUST ask the user about it and stop.
`.trim();
}

export type CommandError = {
    type: 'ambiguous_id_prefix',
    arg: string
} | {
    type: 'invalid_id_prefix',
    arg: string
} | {
    type: 'syntax_error'
    message: string
} | {
    type: 'invalid_command'
};

export type CommandResult = {
    errors: CommandError[],
    transforms: undefined,
} | {
    errors: [],
    transforms: Transforms
};

export const CommandResult = {
    syntaxError: (message: string): CommandResult => ({
        errors: [{ type: 'syntax_error', message }], transforms: undefined
    }),
    error: (e: CommandError): CommandResult => ({
        errors: [e], transforms: undefined
    })
};

export type AgenticResult = {
    cleanedMessage: string,
    commands: { index: number, name: string, code: string, errors: CommandError[] }[],
    system?: string,
    transforms?: Transforms
};

export type Command = {
    doc: string,
    exec: (tr: Transforms, content: string, args: string) => CommandResult
};

const RegisteredCommands: Record<string, Command> = {
    'replace_clusters': replaceClustersCommand
};

export function parseFencedCommands(msg: string, ctx: DocumentContext): AgenticResult {
    const regex = /^(`+)(.+?)(?:\((.+?)\))?\n((?:.|\n)+?)\n\1$/gm;
    const ret: AgenticResult = {
        cleanedMessage: '', commands: [], system: undefined,
        transforms: undefined,
    };
    let tr = {
        source: new Transform(ctx.source.content),
        target: new Transform(ctx.target.content)
    };

    let index = 0, hasError = false;
    ret.cleanedMessage = msg.replaceAll(regex, (code, _, name, args, content) => {
        let replacement = '';
        if (name in RegisteredCommands) {
            const result = RegisteredCommands[name].exec(tr, content, args);
            ret.commands.push({ index, name, code, errors: result.errors });
            if (!result.transforms)
                hasError = true;
            else tr = result.transforms;
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
