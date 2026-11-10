import type {
    StepsJson,
    VcsCommitAttrs,
    VcsImportCommit,
    VcsImportDocument,
} from "./Backend";
import { id } from "./Schema";
import type { TextJSON } from "./TextSchema";
import type { SerializedChatSession } from "./llm/ChatSchema";

// Loose shape of a version-1 `.orz` document

export type LegacyCommit = {
    type: 'delta' | 'merge';
    id: string;
    parent?: string;
    attrs: VcsCommitAttrs;
    source?: StepsJson;
    target?: StepsJson;
};

export type LegacyDocument = {
    currentCommit: string;
    source: unknown;
    target: unknown;
    chats?: unknown;
    vc: {
        initialCommit: string;
        commits: LegacyCommit[];
    };
};

export type NormalizedLegacyImport = {
    document: VcsImportDocument;
    warnings: string[];
};

/**
 * Convert a legacy archive into the typed bulk-import payload consumed by
 * Rust. This owns the old deserialization repair rules:
 *
 * - drop duplicate commit ids;
 * - re-parent commits whose parent is unknown to the initial commit;
 * - fall back to the latest commit when `currentCommit` is missing.
 */
export function normalizeLegacyImport(source: LegacyDocument): NormalizedLegacyImport {
    const initial = source.vc.initialCommit;
    const warnings: string[] = [];

    const kept: LegacyCommit[] = [];
    const ids = new Set<string>();
    for (const commit of source.vc.commits ?? []) {
        if (!commit || typeof commit.id !== 'string') {
            warnings.push('dropping commit without an id');
            continue;
        }
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
            id: id(commit.id),
            parent: id(parent),
            kind: commit.type === 'merge' ? 'merge' : 'delta',
            attrs: {
                ...commit.attrs,
                timestamp: commit.attrs?.timestamp ?? 0,
            },
            source: commit.source,
            target: commit.target,
        };
    });

    let currentCommit = source.currentCommit;
    if (currentCommit !== initial && !known.has(currentCommit)) {
        currentCommit = commits.at(-1)?.id ?? initial;
        warnings.push(`current commit is missing; using ${currentCommit}`);
    }

    return {
        document: {
            initialCommit: id(initial),
            currentCommit: id(currentCommit),
            source: source.source as TextJSON,
            target: source.target as TextJSON,
            chats: (source.chats ?? []) as SerializedChatSession[],
            commits,
        },
        warnings,
    };
}
