import data from "../node_modules/cldr-core/availableLocales.json";
import coverage from "../node_modules/cldr-core/coverageLevels.json";

const setLang = new Map<string, 'modern' | 'moderate' | 'basic' | 'na'>();
const map = new Map<string, [string | undefined, string | undefined][]>();

data.availableLocales.full.map((x) => {
    const [lang, a = undefined, b = undefined] = x.split('-');
    const list = map.get(lang) ?? [];
    if (b) list.push([a, b]);
    else if (a) list.push(/^[A-Z]+$/.exec(a) ? [undefined, a] : [a, undefined]);
    map.set(lang, list);
    if (!setLang.has(lang)) // @ts-expect-error
        setLang.set(lang, coverage.coverageLevels[lang] ?? 'na');
});

import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from "url";

const file = fileURLToPath(import.meta.url);
const dir = dirname(file);

await fs.writeFile(
    path.resolve(dir, '../src/data/LocaleData.ts'),
`export const LanguageCodes = ${JSON.stringify(Object.fromEntries(setLang.entries()))} as const;
export type LanguageCode = keyof typeof LanguageCodes;
export const LanguageVariants: Record<LanguageCode, [string | null, string | null][]> = ${JSON.stringify(Object.fromEntries(map.entries()))};`);
