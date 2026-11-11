import type { ComponentProps } from 'react';
import type { Image } from '@expo/ui/swift-ui';
import { Inbox, Megaphone, MessageSquareText, ShoppingCart, UserRound, type LucideIcon } from 'lucide-react-native';
import { Category } from '@openmailbox/mail-core';

/** What the inbox shows: one category, or all mail. */
export type InboxFilter = 'primary' | 'transactions' | 'updates' | 'promotions' | 'all';

export const INBOX_FILTERS: InboxFilter[] = ['primary', 'transactions', 'updates', 'promotions', 'all'];

export const CATEGORIES: Category[] = [Category.Primary, Category.Transactions, Category.Updates, Category.Promotions];

const FILTER_OF: Record<Category, Exclude<InboxFilter, 'all'>> = {
  [Category.Primary]: 'primary',
  [Category.Transactions]: 'transactions',
  [Category.Updates]: 'updates',
  [Category.Promotions]: 'promotions',
};

type SymbolName = NonNullable<ComponentProps<typeof Image>['systemName']>;

export interface FilterPresentation {
  label: string;
  Icon: LucideIcon;
  /** The SF Symbol iOS draws in place of `Icon`. */
  symbol: SymbolName;
  /** Mail's tint for the category, in light and dark mode. */
  tint: { light: string; dark: string };
}

export const PRESENTATION: Record<InboxFilter, FilterPresentation> = {
  primary: { label: 'categories.primary', Icon: UserRound, symbol: 'person.fill', tint: { light: '#4898de', dark: '#3b86d1' } },
  transactions: { label: 'categories.transactions', Icon: ShoppingCart, symbol: 'cart.fill', tint: { light: '#4fa46b', dark: '#3e9259' } },
  updates: { label: 'categories.updates', Icon: MessageSquareText, symbol: 'text.bubble.fill', tint: { light: '#6a62da', dark: '#5e57cf' } },
  promotions: { label: 'categories.promotions', Icon: Megaphone, symbol: 'megaphone.fill', tint: { light: '#e0507a', dark: '#d2416c' } },
  all: { label: 'categories.all', Icon: Inbox, symbol: 'tray.fill', tint: { light: '#8e8e93', dark: '#636366' } },
};

export function filterOf(category: Category): Exclude<InboxFilter, 'all'> {
  return FILTER_OF[category];
}

/** The category to list, or undefined for all mail. */
export function categoryOf(filter: InboxFilter): Category | undefined {
  return CATEGORIES.find((category) => FILTER_OF[category] === filter);
}
