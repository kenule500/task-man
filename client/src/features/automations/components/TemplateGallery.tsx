import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Disclosure, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { describeRule } from '../lib/describe';
import type { AutomationTemplate } from '../types';

interface TemplateGalleryProps {
  templates: AutomationTemplate[];
  /** Open on first render (empty workspaces) */
  defaultOpen?: boolean;
  disabled?: boolean;
  onUse: (template: AutomationTemplate) => void;
}

/** Ready-made recipes; choosing one opens the rule builder filled in. */
export const TemplateGallery = ({ templates, defaultOpen = false, disabled, onUse }: TemplateGalleryProps) => {
  const { t } = useTranslation('admin');
  if (templates.length === 0) return null;
  return (
    <Surface as="section" aria-label={t('automations.gallery.label')} padding="sm" className="py-0 sm:py-0 sm:px-5">
      <Disclosure
        title={<span className="inline-flex items-center gap-2"><Sparkles aria-hidden className="size-4 text-primary" />{t('automations.gallery.title')}</span>}
        defaultOpen={defaultOpen}
        headingLevel={2}
        className="border-b-0"
      >
        <ul className="grid gap-3 pb-4 sm:grid-cols-2">
          {templates.map(template => (
            <li key={template.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{template.name}</h3>
                <p className="mt-1 text-xs text-slate-600">{describeRule(template)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onUse(template)}
                className="h-10 self-start px-3 text-sm md:h-9"
              >
                {t('automations.gallery.use')}<span className="sr-only">{t('automations.gallery.useSr', { name: template.name })}</span>
              </Button>
            </li>
          ))}
        </ul>
      </Disclosure>
    </Surface>
  );
};
