import { Fragment } from "react";

/**
 * Minimal inline-markdown renderer for AI insight text.
 *
 * Replaces react-markdown, which was pulled in to render output the system prompt
 * constrains to "4-6 sentences, conversational tone" — prose, with at most the
 * occasional **emphasis**. Handles bold, italic and paragraph breaks and nothing
 * else; anything further should go back through the prompt, not a parser.
 *
 * Builds React elements rather than setting innerHTML, so model output can never
 * inject markup. Previously this was also rendered INSIDE a <p>, and
 * react-markdown emits its own <p> — invalid nesting that made the browser close
 * the outer tag early and diverge from React's tree.
 */

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;

function renderInline(text, keyPrefix) {
  return text.split(TOKEN).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export default function RichText({ children, className = "" }) {
  const text = typeof children === "string" ? children : "";
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  if (!paragraphs.length) return null;

  return (
    <div className={className}>
      {paragraphs.map((para, pi) => (
        <p key={pi} className={pi > 0 ? "mt-2" : undefined}>
          {para.split("\n").map((lineText, li) => (
            <Fragment key={li}>
              {li > 0 && <br />}
              {renderInline(lineText, `${pi}-${li}`)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
