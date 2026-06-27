// Mostly written by Gemini 3 Pro

import type { Node } from "prosemirror-model";

export type Token = BlockOpenToken | BlockCloseToken | CharToken;

interface BlockOpenToken {
    kind: 'block_open';
    type: string;
}

interface BlockCloseToken {
    kind: 'block_close';
    type: string;
}

interface CharToken {
    kind: 'char';
    char: string;
    marks: string[]; // Sorted array of mark types for fast equality checks
}

// --- 3. Linearization Engine ---
export function linearize(node: Node): Token[] {
    const tokens: Token[] = [];

    if (node.isText && node.text) {
        const marks = (node.marks || []).map(m => m.type.name).sort();
        // Configurable step: splitting by character here.
        // To diff by word, split by regex `\b` instead.
        for (const char of node.text) {
            tokens.push({ kind: 'char', char, marks });
        }
    } else {
        tokens.push({ kind: 'block_open', type: node.type.name });
        for (const child of node.children)
            tokens.push(...linearize(child));
        tokens.push({ kind: 'block_close', type: node.type.name });
    }

    return tokens;
}

function tokensEqual(t1: Token, t2: Token): boolean {
    if (t1.kind !== t2.kind) return false;
    if (t1.kind === 'char' && t2.kind === 'char') {
        if (t1.char !== t2.char) return false;
        if (t1.marks.length !== t2.marks.length) return false;
        return t1.marks.every((m, i) => m === t2.marks[i]);
    }
    if ('type' in t1 && 'type' in t2) {
        return t1.type === t2.type;
    }
    return false;
}

// --- 4. Diffing Engine ---
export type DiffOp =
    | { op: 'keep', token: Token }
    | { op: 'insert', token: Token }
    | { op: 'delete', token: Token };

// Simple LCS-based Diff.
// Note: For large documents, replace with Myers O(ND) algorithm.
export function computeDiff(oldTokens: Token[], newTokens: Token[]): DiffOp[] {
    const n = oldTokens.length;
    const m = newTokens.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
        if (tokensEqual(oldTokens[i - 1], newTokens[j - 1]))
            dp[i][j] = dp[i - 1][j - 1] + 1;
        else
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }

    const diff: DiffOp[] = [];
    let i = n, j = m;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && tokensEqual(oldTokens[i - 1], newTokens[j - 1])) {
            diff.unshift({ op: 'keep', token: oldTokens[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            diff.unshift({ op: 'insert', token: newTokens[j - 1] });
            j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
            diff.unshift({ op: 'delete', token: oldTokens[i - 1] });
            i--;
        }
    }
    return diff;
}

// --- 5. Patch Optimization & Resolution ---
export type Patch =
    | { action: 'insertNodes', tokens: Token[], index: number }
    | { action: 'deleteRange',
        startIndex: number, endIndex: number }
    | { action: 'updateMarks',
        startIndex: number, endIndex: number, add: string[], remove: string[] };

export function generatePatches(diffs: DiffOp[]): Patch[] {
    const patches: Patch[] = [];
    let currentIndex = 0; // PM absolute position index mapping

    for (let i = 0; i < diffs.length; i++) {
        const current = diffs[i];

        if (current.op === 'keep') {
            currentIndex++; // advance cursor
            continue;
        }

        // Optimization: Detect formatting changes (Delete char + Insert same char with different marks)
        if (current.op === 'delete' && i + 1 < diffs.length && diffs[i + 1].op === 'insert') {
            const next = diffs[i + 1];
            if (current.token.kind === 'char'
             && next.token.kind === 'char'
             && current.token.char === next.token.char
            ) {
                const oldMarks = new Set(current.token.marks);
                const newMarks = new Set(next.token.marks);

                patches.push({
                    action: 'updateMarks',
                    startIndex: currentIndex,
                    endIndex: currentIndex + 1,
                    add: next.token.marks.filter(m => !oldMarks.has(m)),
                    remove: current.token.marks.filter(m => !newMarks.has(m))
                });

                currentIndex++;
                i++; // skip the insert, we handled it as an update
                continue;
            }
        }

        // Standard Delete
        if (current.op === 'delete') {
            patches.push({
                action: 'deleteRange',
                startIndex: currentIndex,
                endIndex: currentIndex + 1
            });
            // Do not increment currentIndex because the node is removed from the target doc
        }

        // Standard Insert
        if (current.op === 'insert') {
            patches.push({
                action: 'insertNodes',
                index: currentIndex,
                tokens: [current.token]
            });
            currentIndex++;
        }
    }

    return optimizePatches(patches);
}

// Merges contiguous patches of the same action into ranges
function optimizePatches(patches: Patch[]): Patch[] {
    const optimized: Patch[] = [];

    for (const patch of patches) {
        if (optimized.length === 0) {
            optimized.push(patch);
            continue;
        }

        const last = optimized[optimized.length - 1];

        if (patch.action === 'deleteRange' && last.action === 'deleteRange'
         && last.startIndex === patch.startIndex
        ) {
            last.endIndex += (patch.endIndex - patch.startIndex);
        } else if (patch.action === 'insertNodes' && last.action === 'insertNodes'
                && last.index + last.tokens.length === patch.index
        ) {
            last.tokens.push(...patch.tokens);
        } else if (patch.action === 'updateMarks' && last.action === 'updateMarks'
                && last.endIndex === patch.startIndex
                && JSON.stringify(last.add) === JSON.stringify(patch.add)
                && JSON.stringify(last.remove) === JSON.stringify(patch.remove)
        ) {
            last.endIndex = patch.endIndex;
        } else {
            optimized.push(patch);
        }
    }

    return optimized;
}
