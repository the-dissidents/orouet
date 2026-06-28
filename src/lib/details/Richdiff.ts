// Draft by Gemini 3 Pro, with manual extensions

import type { Node } from "prosemirror-model";
import { simpleSegmentText } from "./Segmenter";
import { Debug } from "./Util";

export type Token = BlockOpenToken | BlockCloseToken | TextToken;

interface BlockOpenToken {
    kind: 'block_open';
    type: string;
}

interface BlockCloseToken {
    kind: 'block_close';
    type: string;
}

interface TextToken {
    kind: 'token';
    content: string;
    marks: string[]; // Sorted array of mark types for fast equality checks
}

export type LinearizationOptions = {
    segmenter?: (s: string) => string[],
    skipRootBoundary?: boolean
}

// --- 3. Linearization Engine ---
export function linearize(node: Node, opts?: LinearizationOptions): Token[] {
    const tokens: Token[] = [];

    if (node.isText && node.text) {
        const marks = (node.marks || []).map(m => m.type.name).sort();

        const segmenter = opts?.segmenter ?? simpleSegmentText;
        for (const segment of segmenter(node.text)) {
            tokens.push({ kind: 'token', content: segment, marks });
        }
    } else {
        if (!opts?.skipRootBoundary)
            tokens.push({ kind: 'block_open', type: node.type.name });
        for (const child of node.children)
            tokens.push(...linearize(child, { ...opts, skipRootBoundary: false }));
        if (!opts?.skipRootBoundary)
            tokens.push({ kind: 'block_close', type: node.type.name });
    }

    return tokens;
}

function tokensEqual(t1: Token, t2: Token): boolean {
    if (t1.kind !== t2.kind) return false;
    if (t1.kind === 'token' && t2.kind === 'token') {
        if (t1.content !== t2.content) return false;
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

export type VisualMarker =
    | { type: 'insert_text', index: number, endIndex: number, text: string, marks: string[] }
    | { type: 'delete_text', anchorIndex: number, text: string, marks: string[] }
    | { type: 'replace_text', index: number, endIndex: number, deleted: string, deletedMarks: string[], inserted: string, insertedMarks: string[] }
    | { type: 'update_marks', index: number, endIndex: number, text: string, added: string[], removed: string[] }
    | { type: 'insert_block', index: number, nodeType: string, isClose: boolean }
    | { type: 'delete_block', anchorIndex: number, nodeType: string, isClose: boolean };

export function generateMarkers(diffs: DiffOp[]): VisualMarker[] {
    const rawMarkers: VisualMarker[] = [];
    let newDocIndex = 0; // Exclusively tracks positions in the NEW document

    for (let i = 0; i < diffs.length; i++) {
        const current = diffs[i];

        if (current.op === 'keep') {
            newDocIndex += current.token.kind == 'token'
                ? current.token.content.length : 1;
            continue;
        }

        if (current.op === 'insert') {
            if (current.token.kind === 'token') {
                rawMarkers.push({
                    type: 'insert_text',
                    index: newDocIndex,
                    endIndex: newDocIndex + current.token.content.length,
                    text: current.token.content,
                    marks: current.token.marks
                });
                newDocIndex += current.token.content.length;
            } else {
                rawMarkers.push({
                    type: 'insert_block',
                    index: newDocIndex,
                    nodeType: current.token.type,
                    isClose: current.token.kind === 'block_close'
                });
                newDocIndex++;
            }
        }

        if (current.op === 'delete') {
            if (current.token.kind === 'token') {
                rawMarkers.push({
                    type: 'delete_text',
                    anchorIndex: newDocIndex, // Points to the gap where it used to be
                    text: current.token.content,
                    marks: current.token.marks
                });
            } else {
                rawMarkers.push({
                    type: 'delete_block',
                    anchorIndex: newDocIndex,
                    nodeType: current.token.type,
                    isClose: current.token.kind === 'block_close'
                });
            }
        }
    }

    let m = opt1(rawMarkers);
    return opt2(m);
}

function opt1(markers: VisualMarker[]): VisualMarker[] {
    const optimized: VisualMarker[] = [];

    for (const marker of markers) {
        if (optimized.length === 0) {
            optimized.push(marker);
            continue;
        }

        const last = optimized[optimized.length - 1];

        // Merge contiguous text deletions at the exact same anchor
        if (marker.type === 'delete_text' && last.type === 'delete_text'
         && last.anchorIndex === marker.anchorIndex
         && JSON.stringify(last.marks) === JSON.stringify(marker.marks)
        ) {
            last.text += marker.text;
        }
        // Merge contiguous text insertions
        else if (marker.type === 'insert_text' && last.type === 'insert_text'
              && last.endIndex === marker.index
              && JSON.stringify(last.marks) === JSON.stringify(marker.marks)
        ) {
            last.text += marker.text;
            last.endIndex = marker.endIndex;
        }
        // No mark updates yet
        // Do not merge block markers; they represent discrete structural boundaries
        else {
            optimized.push(marker);
        }
    }
    return optimized;
}

function opt2(optimized: VisualMarker[]): VisualMarker[] {
    const result: VisualMarker[] = [];
    for (let i = 0; i < optimized.length; i++) {
        const current = optimized[i];
        if (i == optimized.length - 1) {
            result.push(current);
            continue;
        }

        const next = optimized[i + 1];
        if (current.type === 'delete_text' && next.type === 'insert_text') {
            if (current.text == next.text) result.push({
                type: 'update_marks',
                index: next.index,
                endIndex: next.endIndex,
                text: current.text,
                added: next.marks.filter(m => !new Set(current.marks).has(m)),
                removed: current.marks.filter(m => !new Set(next.marks).has(m)),
            });
            else result.push({
                type: 'replace_text',
                index: next.index,
                endIndex: next.endIndex,
                deleted: current.text, deletedMarks: current.marks,
                inserted: next.text, insertedMarks: next.marks,
            });
            i++;
            continue;
        }
        result.push(current);
    }

    return result;
}

// todo: merge replace patches with only punctuation and whitespace in between, important for western languages

// function opt3(optimized: VisualMarker[]): VisualMarker[] {
//     const result: VisualMarker[] = [];
//     let lastReplace: { type: 'replace_text', index: number, endIndex: number, deleted: string, inserted: string } | undefined;
//     for (let i = 0; i < optimized.length; i++) {
//         const current = optimized[i];

//         if (current.type == 'replace_text') {
//             if (!lastReplace) {
//                 lastReplace = current;
//                 result.push(current);
//             } else {
//                 const between = ;
//                 lastReplace.inserted += lastSkippable + current.inserted;
//                 lastReplace.deleted += lastSkippable + current.deleted;
//                 lastReplace.endIndex = current.endIndex;
//             }
//             continue;
//         } else {
//             lastReplace = undefined;
//         }
//     }

//     return result;
// }
