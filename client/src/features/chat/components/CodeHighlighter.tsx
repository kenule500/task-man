import { Highlight } from 'prism-react-renderer';
import { normaliseLanguage, shouldHighlight } from '../lib/code';

interface CodeHighlighterProps {
  code: string;
  language: string;
}

/**
 * The syntax-highlighting renderer, in its own module on purpose.
 *
 * `prism-react-renderer` is only reachable from this file, which `CodeCard` imports through
 * `React.lazy`, so a workspace that never pastes code never downloads the highlighter (NFR-032).
 *
 * Colours follow the design system rather than a Prism theme: the surface is the existing dark slate
 * token and each token keeps a readable default, so the card does not introduce a second palette
 * (CON-301, CON-302).
 */
const CodeHighlighter = ({ code, language }: CodeHighlighterProps) => {
  const resolved = normaliseLanguage(language);
  // Above the character cap, or for an unknown language, there is nothing useful to tokenise (AC-086)
  if (!shouldHighlight(code, resolved)) {
    return <pre className="overflow-x-auto p-3 text-xs leading-5 text-slate-100"><code>{code}</code></pre>;
  }

  return (
    <Highlight code={code} language={resolved}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre className="overflow-x-auto p-3 text-xs leading-5 text-slate-100">
          <code>
            {tokens.map((line, index) => (
              <span {...getLineProps({ line })} key={index} className="block">
                {line.map((token, key) => {
                  const { children, ...tokenProps } = getTokenProps({ token });
                  return <span {...tokenProps} key={key}>{children}</span>;
                })}
              </span>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
};

export default CodeHighlighter;