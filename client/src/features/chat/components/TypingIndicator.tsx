import { useTranslation } from 'react-i18next';

/** "Ana is typing…" under the message list; the space is always reserved so the list does not jump. */
const TypingIndicator = ({ names }: { names: string[] }) => {
  const { t } = useTranslation('chat');
  let label = '';
  if (names.length === 1) label = t('typing.one', { name: names[0] });
  else if (names.length === 2) label = t('typing.two', { first: names[0], second: names[1] });
  else if (names.length > 2) label = t('typing.many');

  return (
    <div className="h-5 shrink-0 px-5 text-xs text-slate-500" role="status" aria-live="polite">
      {label && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="flex gap-0.5">
            <span className="size-1 rounded-full bg-slate-400 motion-safe:animate-pulse" />
            <span className="size-1 rounded-full bg-slate-400 motion-safe:animate-pulse [animation-delay:150ms]" />
            <span className="size-1 rounded-full bg-slate-400 motion-safe:animate-pulse [animation-delay:300ms]" />
          </span>
          {label}
        </span>
      )}
    </div>
  );
};

export default TypingIndicator;
