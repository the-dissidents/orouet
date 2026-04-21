import { DecorationSet, Decoration } from 'prosemirror-view'
import { Plugin } from 'prosemirror-state'
import { unwrap, type Wrapped } from '$lib/details/Util';

export const placeholder = (text: Wrapped<string>) => new Plugin({
  props: {
    decorations(state) {
      const doc = state.doc;

      if (doc.textContent.length > 0) return;

      const placeHolder = document.createElement('span');
      placeHolder.classList.add('placeholder');
      placeHolder.textContent = unwrap(text);

      return DecorationSet.create(doc, [Decoration.widget(0, placeHolder)]);
    }
  }
});
