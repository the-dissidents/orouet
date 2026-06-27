// Mostly written by Gemini 3 Pro

import type { VisualMarker } from '$lib/details/Richdiff';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const diffPluginKey = new PluginKey<VisualMarker[]>('diffVisualizationPlugin');

export const diffVisualization = (initialMarkers: VisualMarker[]) => {
    return new Plugin<VisualMarker[]>({
        key: diffPluginKey,

        state: {
            init: () => initialMarkers,
            apply: (tr, currentMarkers) => {
                const newMarkers = tr.getMeta(diffPluginKey);
                if (newMarkers) currentMarkers = newMarkers;

                if (!tr.docChanged) return currentMarkers;
                const { mapping } = tr;
                return currentMarkers.map(marker => {
                    switch (marker.type) {
                    case 'insert_text':
                        return { ...marker,
                            index: mapping.map(marker.index, 1),
                            endIndex: mapping.map(marker.endIndex, -1)
                        };
                    case 'insert_block':
                        return { ...marker, index: mapping.map(marker.index) };
                    case 'delete_text':
                    case 'delete_block':
                        return { ...marker, anchorIndex: mapping.map(marker.anchorIndex, -1) };
                    case 'update_marks':
                        return {
                            ...marker,
                            startIndex: mapping.map(marker.index, 1),
                            endIndex: mapping.map(marker.endIndex, -1)
                        };
                    default:
                        marker satisfies never;
                    }
                }).filter(Boolean) as VisualMarker[];
            }
        },

        props: {
            decorations(state) {
                const markers = diffPluginKey.getState(state);
                if (!markers || markers.length === 0) return DecorationSet.empty;

                const decos: Decoration[] = [];

                markers.forEach(marker => {
                    switch (marker.type) {
                    case 'insert_text':
                        // The text exists in the DOM. Decorate the exact range.
                        decos.push(Decoration.inline(
                            marker.index,
                            marker.endIndex,
                            { class: 'diff insert' }
                        ));
                        break;

                    case 'delete_text':
                        // The text is gone from the DOM. Render it as an artificial widget.
                        const deleteWidget = document.createElement('span');
                        deleteWidget.className = 'diff delete';
                        deleteWidget.textContent = marker.text;
                        // Re-apply marks as classes if necessary
                        // todo: look at this
                        marker.marks.forEach(m => deleteWidget.classList.add(`mark-${m}`));

                        decos.push(Decoration.widget(
                            marker.anchorIndex,
                            deleteWidget,
                            { side: -1, marks: [] } // side: -1 renders it before content at this position
                        ));
                        break;

                    case 'update_marks':
                        // const markClasses = [
                        //     ...marker.added.map(m => `diff-mark-added-${m}`),
                        //     ...marker.removed.map(m => `diff-mark-removed-${m}`)
                        // ].join(' ');

                        decos.push(Decoration.inline(
                            marker.index,
                            marker.endIndex,
                            { class: 'diff update-marks' }
                        ));
                        break;

                    case 'insert_block':
                        // Ideally, this should be a Decoration.node() spanning the block.
                        // If forced to use point-indices for open/close tags:
                        const insertBlockWidget = document.createElement('div');
                        insertBlockWidget.className = `diff block-insert ${marker.isClose ? 'close' : 'open'}`;
                        insertBlockWidget.setAttribute('data-node-type', marker.nodeType);

                        decos.push(Decoration.widget(marker.index, insertBlockWidget));
                        break;

                    case 'delete_block':
                        // Render a widget showing a structural block deletion
                        const deleteBlockWidget = document.createElement('div');
                        deleteBlockWidget.className = `diff block-delete ${marker.isClose ? 'close' : 'open'}`;
                        deleteBlockWidget.setAttribute('data-node-type', marker.nodeType);

                        decos.push(Decoration.widget(marker.anchorIndex, deleteBlockWidget));
                        break;
                    default:
                        marker satisfies never;
                    }
                });

                return DecorationSet.create(state.doc, decos);
            }
        }
    });
};
