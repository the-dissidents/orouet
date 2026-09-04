import { Cluster, Doc, ClusterKind, ClusterKinds, parseDOMCluster, type Pointer } from "$lib/Schema";
import type { Fragment } from "prosemirror-model";
import type { Transform } from "prosemirror-transform";
import { CommandResult, type Command, type CommandError } from "../SystemPrompt";
import { Debug } from "$lib/details/Util";

function replaceCluster(
    tr: Transform, [c, pos]: Pointer<Cluster>, content: Fragment
): CommandError | void {
    tr.replaceWith(pos + 1, pos + 1 + c.content.size, content);
}

function setClusterKind(
    tr: Transform, [c, pos]: Pointer<Cluster>, kind: ClusterKind
): CommandError | void {
    if (c.attrs.kind !== kind)
        tr.setNodeAttribute(pos, 'kind', kind);
}

export const replaceClustersCommand: Command = {
    doc: `- \`replace_cluster(id)\`: Accepts at most one <source>, one <target> and one <kind>. Replaces the whole cluster.

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
\`\`\``,

    exec: (tr, xml, arg) => {
        const parser = new DOMParser();
        const doc: Element =
            parser.parseFromString(`<root>${xml}</root>`, "application/xml").children[0];

        if (!doc || doc.querySelector("parsererror")) {
            console.log(doc);
            return CommandResult.syntaxError('XML parse error');
        }

        const sc = Cluster.findByIdPrefix(tr.source.doc as Doc, arg);
        const tc = Cluster.findByIdPrefix(tr.target.doc as Doc, arg);
        Debug.assert(typeof sc === typeof tc);

        if (sc == 'ambiguous' || tc == 'ambiguous')
            return CommandResult.error({ type: 'ambiguous_id_prefix', arg });
        if (!sc || !tc)
            return CommandResult.error({ type: 'invalid_id_prefix', arg });

        let tagNames: string[] = [];
        for (const c of doc.children) {
            let e: CommandError | void;

            if (tagNames.includes(c.tagName)) return CommandResult.syntaxError(`multiple <${c.tagName}> found when at most one is allowed`);
            tagNames.push(c.tagName);

            switch (c.tagName) {
                case 'kind':
                    const k = (c.textContent) as ClusterKind;
                    if (!ClusterKinds.includes(k))
                        return CommandResult.syntaxError(`invalid cluster kind '${c.tagName}'`);
                    if (e = setClusterKind(tr.source, sc, k)) return CommandResult.error(e);
                    if (e = setClusterKind(tr.target, tc, k)) return CommandResult.error(e);
                    break;

                case 'source': {
                    const content = parseDOMCluster(c, 'text').at(0)?.content;
                    if (!content) return CommandResult.syntaxError(`<source> must contain at least one block`);
                    if (e = replaceCluster(tr.source, sc, content))
                        return CommandResult.error(e);
                }
                case 'target': {
                    const content = parseDOMCluster(c, 'text').at(0)?.content;
                    if (!content) return CommandResult.syntaxError(`<target> must contain at least one block`);
                    if (e = replaceCluster(tr.target, sc, content))
                        return CommandResult.error(e);
                }
                default: return CommandResult.syntaxError(`expected <source>, <target> or <kind>, found '${c.tagName}'`);
            }
        }

        return { errors: [], transforms: tr };
    }
};
