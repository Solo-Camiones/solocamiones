import { useId, useState, type FormEvent } from 'react';

import { Button, Field, Info, Input, PasswordInput } from '../../shared/ui';
import { useAuth } from './useAuth';

export type LoginFormProps = {
  onSuccess?: () => void;
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const normalizedUsername = username.trim();
    setUsername(normalizedUsername);

    const result = await login(normalizedUsername, password);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Info id={errorId} tone="error" title="No se pudo iniciar sesión">
          {error}
        </Info>
      )}

      <Field
        label="Usuario"
        htmlFor="username"
        invalid={Boolean(error)}
        describedBy={error ? errorId : undefined}
      >
        <Input
          id="username"
          name="username"
          autoComplete="username"
          placeholder="Ingrese su usuario"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
      </Field>

      <Field
        label="Contraseña"
        htmlFor="password"
        invalid={Boolean(error)}
        describedBy={error ? errorId : undefined}
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="Ingrese su contraseña"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </Field>

      <Button type="submit" className="w-full" disabled={isSubmitting} busy={isSubmitting}>
        {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </form>
  );
}
