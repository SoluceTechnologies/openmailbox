import { useQuery } from '@tanstack/react-query';

import { mailCore } from '@/core/mailCore';
import { contactAddresses } from '@/services/contacts';
import type { MailAddress } from '@/utils/addresses';

const SUGGESTION_LIMIT = 8;

/** People already written to or heard from, then the phone's contacts, each address once. */
export function useRecipientSuggestions(query: string): MailAddress[] {
  const trimmed = query.trim();
  const suggestions = useQuery({
    queryKey: ['suggestions', trimmed],
    enabled: trimmed.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const [known, contacts] = await Promise.all([
        mailCore().suggestAddresses(trimmed, SUGGESTION_LIMIT),
        contactAddresses(trimmed).catch(() => []),
      ]);
      const seen = new Set<string>();
      return [...known, ...contacts]
        .filter((address) => {
          const key = address.email.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, SUGGESTION_LIMIT);
    },
  });
  return trimmed.length > 0 ? (suggestions.data ?? []) : [];
}
