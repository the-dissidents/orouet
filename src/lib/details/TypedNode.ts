import type { Mark, Fragment, NodeType, Attrs, Slice, ResolvedPos, MarkType, Node } from "prosemirror-model";

export interface TypedNode<C extends Node, A extends Attrs = {}> extends Node {
    readonly attrs: A;
    readonly marks: readonly Mark[];
    readonly content: Fragment;
    get children(): readonly C[];
    child(index: number): C;
    maybeChild(index: number): C | null;
    forEach(f: (node: C, offset: number, index: number) => void): void;
    nodesBetween(from: number, to: number, f: (node: C, pos: number, parent: Node | null, index: number) => void | boolean, startPos?: number): void;
    descendants(f: (node: C, pos: number, parent: Node | null, index: number) => void | boolean): void;
    textBetween(from: number, to: number, blockSeparator?: string | null, leafText?: null | string | ((leafNode: C) => string)): string;
    get firstChild(): C | null;
    get lastChild(): C | null;
    eq(other: Node): boolean;
    sameMarkup(other: Node): boolean;
    hasMarkup(type: NodeType, attrs?: Attrs | null, marks?: readonly Mark[]): boolean;
    copy(content?: Fragment | null): C;
    mark(marks: readonly Mark[]): C;
    cut(from: number, to?: number): C;
    replace(from: number, to: number, slice: Slice): C;
    nodeAt(pos: number): C | null;
    childAfter(pos: number): {
        node: C | null;
        index: number;
        offset: number;
    };
    childBefore(pos: number): {
        node: C | null;
        index: number;
        offset: number;
    };
    resolve(pos: number): ResolvedPos;
    rangeHasMark(from: number, to: number, type: Mark | MarkType): boolean;
    canAppend(other: C): boolean;
}
