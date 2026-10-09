import { useId, type KeyboardEvent, type ReactNode } from 'react';

type TabItem<T extends string> = {
  id: T;
  label: string;
};

export type TabsProps<T extends string> = {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  panels: Record<T, ReactNode>;
  'aria-label': string;
};

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  panels,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  const baseId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    event.preventDefault();
    const lastIndex = tabs.length - 1;
    let nextIndex = index;
    if (event.key === 'ArrowRight') {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else {
      nextIndex = lastIndex;
    }

    const next = tabs[nextIndex];
    if (!next) {
      return;
    }

    onChange(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  }

  return (
    <div>
      <div
        className="mb-6 flex flex-wrap gap-1 rounded-xl border border-navy-100 bg-navy-50 p-1"
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50 ${
                selected ? 'bg-white text-navy shadow-sm' : 'text-navy-400 hover:text-navy'
              }`}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== value}
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
