import { Debug } from "$lib/details/Util";
import { Doc, PaneSchema } from "$lib/Schema";
import type { Docs } from "$lib/VersionControl.svelte";
import { DOMSerializer } from "prosemirror-model";

const serializer = DOMSerializer.fromSchema(PaneSchema);

function findMinimalUniqueIdLength(doc: Doc) {
    const ids = doc.children.map((x) => x.attrs.id);
    if (ids.length < 2) return 4;
    for (let l = 4; l < ids[0].length; l++) {
        if (new Set(ids.map((x) => x.slice(0, l))).size == ids.length)
            return l;
    }
    Debug.assert(false);
}

export function getInterlacedRepresentation(docs: Docs) {
    const s = docs.source.children;
    const t = docs.target.children;
    Debug.assert(s.length == t.length);

    const idLen = findMinimalUniqueIdLength(docs.source);
    const temp = document.createElement('doc');
    for (let i = 0; i < s.length; i++) {
        const sc = s[i], tc = t[i];

        const cluster = document.createElement('cluster');
        cluster.setAttribute("id", sc.attrs.id.slice(0, idLen));
        cluster.setAttribute("kind", sc.attrs.kind);

        const source = document.createElement('source');
        serializer.serializeFragment(sc.content, {}, source);
        const target = document.createElement('target');
        serializer.serializeFragment(tc.content, {}, target);

        cluster.replaceChildren(source, target);
        temp.appendChild(cluster);
    }
    const xmls = new XMLSerializer();
    return xmls.serializeToString(temp);
}
