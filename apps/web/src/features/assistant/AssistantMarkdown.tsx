import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

import { toApprovedAppPath } from './approved-app-path';

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
  // Disallow raw HTML execution paths — react-markdown without rehype-raw skips HTML nodes.
};

type AssistantMarkdownProps = {
  content: string;
  className?: string;
};

export function AssistantMarkdown({ content, className }: AssistantMarkdownProps) {
  return (
    <div
      className={
        className ??
        'space-y-2 text-sm leading-relaxed text-navy [&_a]:font-medium [&_code]:rounded [&_code]:bg-navy-50 [&_code]:px-1 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5'
      }
    >
      <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
}
