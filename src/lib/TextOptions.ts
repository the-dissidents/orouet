import * as z from "zod/v4-mini";

export const EmphasisStyle =
    z.enum(["italic", "bold", "smallcaps", "underline", "mark", "gesperrt"]);

export type EmphasisStyle = z.infer<typeof EmphasisStyle>;

export const TextOptions = z.object({
    numericStyle: z.enum(["lining", "oldstyle", "tabular"]),
    emphasisStyle: EmphasisStyle,
    keywordStyle: EmphasisStyle,
    justify: z.boolean(),
    hyphenation: z.boolean(),
    sizeAdjustment: z.number(),
    ligatures: z.object({
        common: z.optional(z.boolean()),
        discretionary: z.optional(z.boolean()),
        historical: z.optional(z.boolean()),
        contextual: z.optional(z.boolean()),
    })
});

export type TextOptions = z.infer<typeof TextOptions>;

export const DefaultOptions: Record<string, TextOptions> = {
    'en': {
        numericStyle: 'oldstyle',
        emphasisStyle: 'italic',
        keywordStyle: 'bold',
        justify: false,
        hyphenation: false,
        sizeAdjustment: 1,
        ligatures: { common: true }
    },
    'zh': {
        numericStyle: 'lining',
        emphasisStyle: 'mark',
        keywordStyle: 'bold',
        justify: true,
        hyphenation: false,
        sizeAdjustment: 1,
        ligatures: { common: true }
    }
};
