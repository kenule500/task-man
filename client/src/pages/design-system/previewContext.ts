import { createContext, useContext } from 'react';
import type { AppLanguage } from '@/i18n/language';

// The guide's preview language: which language the live specimens render in. Provided by GuidePreviewProvider.

export interface GuidePreview {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
}

export const PreviewContext = createContext<GuidePreview>({ language: 'en', setLanguage: () => undefined });

export const useGuidePreview = (): GuidePreview => useContext(PreviewContext);
