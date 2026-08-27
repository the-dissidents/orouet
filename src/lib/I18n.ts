import { init, register, _, unwrapFunctionStore, locale } from 'svelte-i18n';
import { get } from 'svelte/store';
import en from '../locales/en.json';
import zh from '../locales/zh.json';
import de from '../locales/de.json';

register('en', () => Promise.resolve(en));
register('zh', () => Promise.resolve(zh));
register('de', () => Promise.resolve(de));

init({
	fallbackLocale: 'en',
	initialLocale: 'en',
});

export const $_ = unwrapFunctionStore(_);
export { locale };

export function getLocale(): string {
	return get(locale) ?? 'en';
}

const rtlLanguages = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ckb', 'ug']);

export function getTextDirection(localeStr: string): 'ltr' | 'rtl' {
	try {
		const intlLocale = new Intl.Locale(localeStr) as Intl.Locale & {
			getTextInfo?: () => { direction?: string };
			textInfo?: { direction?: string };
		};
		const direction = intlLocale.getTextInfo?.().direction ?? intlLocale.textInfo?.direction;
		if (direction === 'ltr' || direction === 'rtl') return direction;
	} catch {
		// ignore parsing errors and fall back below
	}
	return rtlLanguages.has(localeStr.split('-')[0]?.toLowerCase() ?? '') ? 'rtl' : 'ltr';
}
