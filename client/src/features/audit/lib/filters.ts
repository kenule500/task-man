import { AUDIT_AREAS, type AuditArea, type AuditFilters } from '../types';

const isArea = (value: string): value is AuditArea => (AUDIT_AREAS as readonly string[]).includes(value);

/** Reads the filters from URL search params; unknown areas are ignored. */
export const parseAuditFilters = (params: URLSearchParams): AuditFilters => {
  const area = params.get('area') ?? '';
  return { area: isArea(area) ? area : '', actor: params.get('actor')?.trim() ?? '' };
};

/** Writes the filters into a copy of `base`, keeping unrelated params and omitting empty filters. */
export const withAuditFilters = (base: URLSearchParams, filters: AuditFilters): URLSearchParams => {
  const next = new URLSearchParams(base);
  if (filters.area) next.set('area', filters.area); else next.delete('area');
  if (filters.actor) next.set('actor', filters.actor); else next.delete('actor');
  return next;
};

export const hasActiveFilters = (filters: AuditFilters): boolean => Boolean(filters.area || filters.actor);
