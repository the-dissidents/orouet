import * as z from "zod/v4-mini";
import { Id, PaneSchema } from "./Schema";
import { Text } from "./TextSchema";
import { Step } from "prosemirror-transform";
import { SerializedChatSession } from "./llm/ChatSchema";
import { StepsJson, VcsCommitAttrs, type Commit, type VcsImportCommit, type VcsImportDocument } from "./Backend";

// validate legacy step JSON without keeping Step instances around
const LegacySteps = z.codec(z.unknown(), StepsJson, {
    decode: (v, ctx) => {
        try {
            const steps = z.decode(StepsJson, v as z.input<typeof StepsJson>);
            for (const raw of [...steps.steps, ...steps.invertedSteps])
                Step.fromJSON(PaneSchema, raw);
            return steps;
        } catch (e: any) {
            ctx.issues.push({
                code: 'invalid_format',
                format: 'ProseMirror Step',
                input: `...`,
                message: e.message,
            });
            return z.NEVER;
        }
    },
    encode: (v) => v,
});

export const LegacyCommit = z.object({
    type: z.enum(['delta', 'merge']),
    id: Id<Commit>(),
    parent: z.optional(Id<Commit>()),
    attrs: VcsCommitAttrs,
    source: z.optional(LegacySteps),
    target: z.optional(LegacySteps),
});

export type LegacyCommit = z.infer<typeof LegacyCommit>;

export const LegacyDocument = z.object({
    version: z.literal(1),
    source: Text,
    target: Text,
    currentCommit: Id<Commit>(),
    vc: z.object({
        version: z.literal(1),
        initialCommit: Id<Commit>(),
        commits: z.array(LegacyCommit),
    }),
    chats: z.array(SerializedChatSession),
});

export type LegacyDocument = z.infer<typeof LegacyDocument>;

export type NormalizedLegacyImport = {
    document: VcsImportDocument;
    warnings: string[];
};

/** Convert a legacy archive to the typed bulk-import payload, applying old repair rules. */
export function normalizeLegacyImport(source: unknown): NormalizedLegacyImport {
    const document = z.decode(LegacyDocument, source as z.input<typeof LegacyDocument>);
    const initial = document.vc.initialCommit;
    const warnings: string[] = [];

    const kept: LegacyCommit[] = [];
    const ids = new Set<string>();
    for (const commit of document.vc.commits) {
        if (commit.id === initial) continue;
        if (ids.has(commit.id)) {
            warnings.push(`dropping duplicate commit ${commit.id}`);
            continue;
        }
        ids.add(commit.id);
        kept.push(commit);
    }

    const known = new Set<string>([initial, ...ids]);
    const commits: VcsImportCommit[] = kept.map((commit) => {
        let parent = commit.type === 'delta' && commit.parent
            ? commit.parent
            : initial;
        if (!known.has(parent)) {
            warnings.push(`re-parenting commit ${commit.id} from ${parent} to ${initial}`);
            parent = initial;
        }

        return {
            id: commit.id,
            parent,
            kind: commit.type,
            attrs: commit.attrs,
            source: commit.source,
            target: commit.target,
        };
    });

    let currentCommit = document.currentCommit;
    if (currentCommit !== initial && !known.has(currentCommit)) {
        currentCommit = commits.at(-1)?.id ?? initial;
        warnings.push(`current commit is missing; using ${currentCommit}`);
    }

    return {
        document: {
            initialCommit: initial,
            currentCommit,
            source: z.encode(Text, document.source),
            target: z.encode(Text, document.target),
            chats: document.chats,
            commits,
        },
        warnings,
    };
}
