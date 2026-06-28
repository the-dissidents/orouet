import { Debug } from "$lib/details/Util";
import { PaneSchema } from "$lib/Schema";
import type { Docs } from "$lib/VersionControl.svelte";
import { DOMSerializer } from "prosemirror-model";

const serializer = DOMSerializer.fromSchema(PaneSchema);

export function getInterlacedRepresentation(docs: Docs) {
    const s = docs.source.children;
    const t = docs.target.children;
    Debug.assert(s.length == t.length);

    const temp = document.createElement('oro-doc');
    for (let i = 0; i < s.length; i++) {
        const sc = s[i], tc = t[i];

        const cluster = document.createElement('oro-cluster');
        cluster.setAttribute("id", sc.attrs.id);
        cluster.setAttribute("kind", sc.attrs.kind);

        const source = document.createElement('oro-source');
        serializer.serializeFragment(sc.content, {}, source);
        const target = document.createElement('oro-target');
        serializer.serializeFragment(tc.content, {}, target);

        cluster.replaceChildren(source, target);
        temp.appendChild(cluster);
    }
    const xmls = new XMLSerializer();
    return xmls.serializeToString(temp);
}
