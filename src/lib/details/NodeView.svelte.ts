import type { Node } from "prosemirror-model";
import type { Decoration, DecorationSource, EditorView, NodeView, NodeViewConstructor, ViewMutationRecord } from "prosemirror-view";
import { mount, unmount } from "svelte";

export type NodeViewProps = {
    node: Node,
    view: EditorView,
    getPos: () => number | undefined,
};

export type NodeViewExports = { };

export function createNodeView<
    Props extends Record<string, any>, Exports extends NodeViewExports
> (
    component: Parameters<typeof mount<Props, Exports>>[0],
    props: Omit<Props, keyof NodeViewProps>
): NodeViewConstructor {
    class N implements NodeView {
        constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
            this.dom.style.display = 'contents';
            const p = $state({ ...props, node, view, getPos } as Props & NodeViewProps);
            this.$props = p;
            this.component = mount(component, { target: this.dom, props: p });
        }

        readonly component: Exports;
        readonly $props: Props & NodeViewProps;

        readonly dom = document.createElement('div');

        get contentDOM() {
            const d = this.dom.querySelector('[data-node-view-content]');
            return d as HTMLElement ?? undefined;
        }

        update(node: Node) {
            this.$props.node = node;
            return true;
        }

        // setSelection?: ((anchor: number, head: number, root: Document | ShadowRoot) => void) | undefined;

        // destroy() {
        //     unmount(component);
        // }
    }
    return (node, view, getPos) => new N(node, view, getPos);
}
