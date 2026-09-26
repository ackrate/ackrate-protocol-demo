import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-json";
import { Fragment, type ReactNode } from "react";

type Language = "bash" | "typescript" | "json";
function renderTokens(tokens: Prism.TokenStream): ReactNode {
  if (typeof tokens === "string") return tokens;
  if (Array.isArray(tokens)) return tokens.map((token, index) => <Fragment key={index}>{renderTokens(token)}</Fragment>);
  return <span className={`token ${tokens.type}`}>{renderTokens(tokens.content)}</span>;
}

/** Render tokens as React text nodes so snippets never become executable HTML. */
export default function CodeBlock({ children, language = "bash" }: { children: string; language?: Language }) {
  return <pre className="code-block"><code className={`language-${language}`}>{renderTokens(Prism.tokenize(children, Prism.languages[language]))}</code></pre>;
}
