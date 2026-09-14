import {
  Children,
  isValidElement,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

import { SelectMenu, type SelectMenuOption } from './SelectMenu';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  searchable?: boolean;
  searchPlaceholder?: string;
  'data-pos-field'?: string;
};

function flattenOptionLabel(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(flattenOptionLabel).join('');
  }
  if (isValidElement(node)) {
    return flattenOptionLabel((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function optionsFromChildren(children: ReactNode): SelectMenuOption[] {
  const options: SelectMenuOption[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (child.type === 'optgroup') {
      options.push(...optionsFromChildren((child.props as { children?: ReactNode }).children));
      return;
    }
    if (child.type !== 'option') {
      return;
    }
    const props = child.props as {
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    };
    options.push({
      value: String(props.value ?? ''),
      label: flattenOptionLabel(props.children),
      disabled: props.disabled,
    });
  });

  return options;
}

/**
 * Drop-in replacement for a native select. Renders a styled listbox so
 * Windows/Chrome cannot paint the OS dropdown over the rest of the UI.
 */
export function Select({
  className = '',
  id,
  children,
  value,
  disabled,
  required,
  searchable,
  searchPlaceholder,
  onChange,
  ...props
}: SelectProps) {
  const options = optionsFromChildren(children);
  const stringValue = value == null ? '' : String(value);

  return (
    <SelectMenu
      id={id}
      className={className}
      value={stringValue}
      options={options}
      disabled={disabled}
      required={required}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
      data-pos-field={props['data-pos-field']}
      onChange={(next) => {
        onChange?.({
          target: { value: next },
          currentTarget: { value: next },
        } as ChangeEvent<HTMLSelectElement>);
      }}
    />
  );
}
