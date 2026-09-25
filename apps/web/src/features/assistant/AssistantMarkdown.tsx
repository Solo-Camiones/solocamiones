import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { toApprovedAppPath } from './approved-app-path';
import { formatAssistantTimestamps } from './format-assistant-timestamps';
import { normalizeCompactMarkdownTables } from './normalize-compact-markdown-tables';

const markdownComponents: Components = {
  a({ href, children }) {
    const appPath = toApprovedAppPath(href);
    if (appPath) {
      return (
        <Link to={appPath} className="font-medium text-brand underline-offset-2 hover:underline">
          {children}
        </Link>
      );
    }
    return <span>{children}</span>;
  },
  table({ children }) {
    return (
      <div className="my-2 max-w-full overflow-x-auto rounded-lg border border-navy-100">
        <table className="w-full min-w-[16rem] border-collapse text-left text-xs">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-navy-50 text-navy-700">{children}</thead>;
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-navy-50">{children}</tbody>;
  },
  tr({ children }) {
    return <tr className="even:bg-navy-50/40">{children}</tr>;
  },
  th({ children }) {
    return (
      <th className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-navy">{children}</th>
    );
  },
  td({ children }) {
    return <td className="whitespace-nowrap px-2.5 py-1.5 text-navy-700">{children}</td>;
  },
  // Disallow raw HTML execution paths — react-markdown without rehype-raw skips HTML nodes.
};

type AssistantMarkdownProps = {
  content: string;
  className?: string;
};

export function AssistantMarkdown({ content, className }: AssistantMarkdownProps) {
  const normalized = formatAssistantTimestamps(normalizeCompactMarkdownTables(content));

  return (
    <div
      className={
        className ??
        'space-y-2 text-sm leading-relaxed text-navy [&_a]:font-medium [&_code]:rounded [&_code]:bg-navy-50 [&_code]:px-1 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5'
      }
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
