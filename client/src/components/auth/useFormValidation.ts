import { useCallback, useMemo, useState } from 'react';

type Validators<K extends string> = Record<K, (value: string, all: Record<K, string>) => string>;

/**
 * Field-level validation: errors show after a field is blurred (or on submit) and then
 * update live while typing. Field ids must equal their keys so focus can move to the first error.
 */
export const useFormValidation = <K extends string>(values: Record<K, string>, validators: Validators<K>) => {
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>({});

  const errors = useMemo(() => {
    const result = {} as Record<K, string>;
    (Object.keys(validators) as K[]).forEach((key) => {
      result[key] = validators[key](values[key], values);
    });
    return result;
  }, [validators, values]);

  /** Error to display for a field (empty until it was blurred or submitted). */
  const errorFor = (key: K): string => (touched[key] ? errors[key] : '');

  const touch = useCallback((key: K) => setTouched((current) => ({ ...current, [key]: true })), []);

  /** Marks every field touched. Returns true when valid, otherwise focuses the first invalid field. */
  const validateAll = (): boolean => {
    const keys = Object.keys(validators) as K[];
    setTouched(Object.fromEntries(keys.map((key) => [key, true])) as Record<K, boolean>);
    const firstInvalid = keys.find((key) => errors[key]);
    if (firstInvalid) document.getElementById(firstInvalid)?.focus();
    return !firstInvalid;
  };

  const reset = useCallback(() => setTouched({}), []);

  return { errors, errorFor, touch, validateAll, reset };
};
