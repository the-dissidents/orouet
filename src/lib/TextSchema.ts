import * as z from "zod/v4-mini";
import { Doc } from "./Schema";
import { TextOptions } from "./TextOptions";
import { LanguageCodes, type LanguageCode } from "../data/LocaleData";

export const LocaleId = z.tuple([
    z.nullable(z.enum(Object.keys(LanguageCodes) as LanguageCode[])),
    z.nullable(z.string()),
    z.nullable(z.string()),
]);

export type LocaleId = z.infer<typeof LocaleId>;

export const Text = z.object({
    content: Doc,
    language: z._default(LocaleId, ['en', null, null]),
    options: TextOptions
});

export type Text = z.infer<typeof Text>;
export type TextJSON = z.input<typeof Text>;
