import { invoke } from "@tauri-apps/api/core";
import { getPassword, setPassword, deletePassword } from "tauri-plugin-keyring-api";

export const Backend = {
    async saveCompressed(path: string, content: string) {
        await invoke<void>('save_compressed', {path, content});
    },

    async readCompressed(path: string) {
        return await invoke<string>('read_compressed', {path});
    },
}

export type VcsCommitAttrs = {
    timestamp: number;
    label?: string;
    currentCluster?: string;
    fileSaved?: boolean;
    selectionSet?: boolean;
};

export type VcsCommitSummary = {
    id: string;
    parent?: string;
    type: 'root' | 'delta' | 'merge';
    attrs: VcsCommitAttrs;
    seq: number;
    depth: number;
};

export type VcsSnapshot = {
    docId: string;
    path?: string | null;
    initialCommit: string;
    currentCommit: string;
    checkpointCommit: string;
    source: unknown;
    target: unknown;
    chats: unknown;
    summaries: VcsCommitSummary[];
};

export type VcsPathSegment = {
    id: string;
    direction: 'forward' | 'backward';
    source?: unknown;
    target?: unknown;
};

export type VcsNewCommit = {
    id: string;
    parent: string;
    attrs: VcsCommitAttrs;
    source?: unknown;
    target?: unknown;
};

export type VcsImportCommit = {
    id: string;
    parent: string;
    kind: 'delta' | 'merge';
    attrs: VcsCommitAttrs;
    source?: unknown;
    target?: unknown;
};

export type VcsImportDocument = {
    initialCommit: string;
    currentCommit: string;
    source: unknown;
    target: unknown;
    chats: unknown;
    commits: VcsImportCommit[];
};

export const VcsBackend = {
    async create(
        source: unknown, target: unknown, chats: unknown, path?: string,
    ) {
        return await invoke<VcsSnapshot>('vcs_create', {
            path: path ?? null, source, target, chats,
        });
    },

    async open(path: string) {
        return await invoke<VcsSnapshot>('vcs_open', {path});
    },

    async importLegacy(document: VcsImportDocument) {
        return await invoke<VcsSnapshot>('vcs_import', {document});
    },

    async append(docId: string, commit: VcsNewCommit) {
        return await invoke<VcsCommitSummary>('vcs_append', {docId, commit});
    },

    async updateAttrs(
        docId: string, id: string, attrs: Partial<VcsCommitAttrs>,
    ) {
        await invoke<void>('vcs_update_attrs', {docId, id, attrs});
    },

    async setCurrent(docId: string, id: string) {
        await invoke<void>('vcs_set_current', {docId, id});
    },

    async saveCheckpoint(
        docId: string,
        currentCommit: string,
        source: unknown,
        target: unknown,
        chats: unknown,
    ) {
        await invoke<void>('vcs_save_checkpoint', {
            docId, currentCommit, source, target, chats,
        });
    },

    async planPath(docId: string, from: string, to: string) {
        return await invoke<VcsPathSegment[]>('vcs_plan_path', {docId, from, to});
    },

    async count(docId: string) {
        return await invoke<number>('vcs_count', {docId});
    },

    async saveAs(docId: string, path: string) {
        return await invoke<VcsSnapshot>('vcs_save_as', {docId, path});
    },
}

export const Secrets = {
    async get(name: string) {
        const value = await getPassword('secret', name);
        return value ?? null;
    },

    async set(name: string, value: string) {
        await setPassword('secret', name, value);
    },

    async delete(name: string) {
        await deletePassword('secret', name);
    },
}
