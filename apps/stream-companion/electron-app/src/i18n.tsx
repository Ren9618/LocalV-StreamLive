import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

// 対応言語一覧
export type Locale = 'ja' | 'en' | 'zh-CN' | 'zh-TW' | 'ko';

// 言語表示名
export const localeNames: Record<Locale, string> = {
    ja: '日本語',
    en: 'English',
    'zh-CN': '中文（简体）',
    'zh-TW': '中文（繁體）',
    ko: '한국어',
};

// 翻訳辞書の型（ネストされたキーをサポート）
export type TranslationDict = Record<string, string>;

// 翻訳ファイルの遅延読み込みマップ
const localeModules: Record<Locale, () => Promise<{ default: TranslationDict }>> = {
    ja: () => import('./locales/ja'),
    en: () => import('./locales/en'),
    'zh-CN': () => import('./locales/zh-CN'),
    'zh-TW': () => import('./locales/zh-TW'),
    ko: () => import('./locales/ko'),
};

// コンテキスト
interface LocaleContextType {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextType>({
    locale: 'ja',
    setLocale: () => { },
    t: (key) => key,
});

// システム言語からアプリの対応言語を判定
function detectSystemLocale(): Locale {
    // Electron環境: preloadから取得
    const electronLocale = (window as any).__systemLocale__;
    const raw = electronLocale || navigator.language || 'ja';
    const lang = raw.toLowerCase();

    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('ko')) return 'ko';
    if (lang === 'zh-tw' || lang === 'zh-hant') return 'zh-TW';
    if (lang.startsWith('zh')) return 'zh-CN';
    if (lang.startsWith('en')) return 'en';

    // 未対応言語の場合は英語にフォールバック
    return 'en';
}

// 永続化キー
const LOCALE_STORAGE_KEY = 'app-locale';

// プロバイダー
export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(() => {
        // 優先順位: ユーザー手動設定 > システム言語 > 日本語
        const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
        if (saved && saved in localeNames) return saved;
        return detectSystemLocale();
    });

    const [dict, setDict] = useState<TranslationDict>({});

    // 言語変更時に翻訳辞書をロード
    useEffect(() => {
        localeModules[locale]().then((mod) => {
            setDict(mod.default);
        });
    }, [locale]);

    const setLocale = (newLocale: Locale) => {
        setLocaleState(newLocale);
        localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    };

    // 翻訳関数（パラメータ置換対応）
    const t = (key: string, params?: Record<string, string | number>): string => {
        let text = dict[key] || key;
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
        }
        return text;
    };

    return (
        <LocaleContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </LocaleContext.Provider>
    );
}

// フック
export function useLocale() {
    return useContext(LocaleContext);
}
