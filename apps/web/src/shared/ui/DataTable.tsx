import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function TableShell({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const tableEl = tableRef.current ?? scrollEl?.querySelector('table');
    if (!scrollEl) {
      return;
    }

    function check() {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 1);
    }

    check();
    scrollEl.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);

    const observer = new ResizeObserver(check);
    observer.observe(scrollEl);
    if (tableEl) {
      observer.observe(tableEl);
    }

    return () => {
      scrollEl.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative min-w-0">
      <div
        ref={scrollRef}
        className="max-w-full overflow-x-auto overflow-y-hidden rounded-xl border border-navy-100 bg-white"
      >
        <table ref={tableRef} className="min-w-full text-left text-sm">
          {children}
        </table>
      </div>
      {canScrollRight ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-navy-100/60 to-transparent"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function clickCameFromControl(event: MouseEvent<HTMLTableRowElement>): boolean {
  const target = event.target;
  return target instanceof Element && Boolean(target.closest('a, button, input, select, textarea'));
}

/** Hover always. When `to` is set, clicking empty cells opens that route; real links/buttons keep their own action. */
export function HoverRow({ children, to }: { children: ReactNode; to?: string }) {
  const navigate = useNavigate();

  return (
    <tr
      className={`text-navy hover:bg-navy-50/60${to ? ' cursor-pointer' : ''}`}
      onClick={
        to
          ? (event) => {
              if (clickCameFromControl(event)) {
                return;
              }
              navigate(to);
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}

export function EntityLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}
