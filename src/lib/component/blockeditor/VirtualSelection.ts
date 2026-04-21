import { Decoration, DecorationSet } from "prosemirror-view";
import { Plugin } from 'prosemirror-state';

export const virtualSelection = new Plugin({
  state: {
    init() {
        return { deco: DecorationSet.empty };
    },
    apply(tr, state, _, { doc }) {
	    if (tr.docChanged || tr.selectionSet) {
            const sel = tr.selection;
            return { deco: DecorationSet.create(doc, [
                Decoration.inline(sel.from, sel.to, { class: 'virtual-selection' })
            ]) };
		}
        return state;
    }
  },
  props: {
    decorations(state) {
        return this.getState(state)?.deco ?? null;
    }
  }
});
