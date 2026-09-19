import { useState, type InputHTMLAttributes } from 'react';

import { Input } from './Field';
import { EyeIcon, EyeOffIcon } from './icons';

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Password field with the same show/hide eye toggle used on login.
 * Visibility state is local per field so profile can have independent toggles.
 */
export function PasswordInput({ className = '', ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={showPassword ? 'text' : 'password'}
        className={`pr-11 ${className}`.trim()}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center px-3 text-navy-400 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/50"
        onClick={() => setShowPassword((value) => !value)}
        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
