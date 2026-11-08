import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Inbox, Settings, TriangleAlert } from 'lucide-react-native';
import { MailboxRole, type Account, type Mailbox } from '@openmailbox/mail-core';

import { BottomBar } from '@/components/BottomBar';
import { useAccounts, useMailboxes } from '@/core/hooks';
import { UNIFIED_SCOPE } from '@/core/queryClient';
import { mailboxBadge, mailboxIcon, mailboxName } from '@/features/mailboxes/mailboxPresentation';
import { useSyncLabel } from '@/features/sync/useSyncLabel';
import { useSyncStore } from '@/stores/syncStore';
import { accountColor } from '@/theme';
import { IconButton, Item, List, Typography, ViewContainer } from '@/ui/components';

let unifiedInboxOpened = false;

function CountAndChevron({ count }: { count: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.trailing}>
      {count > 0 ? <Typography color="secondary">{count}</Typography> : null}
      <ChevronRight size={18} color={colors.textTertiary} />
    </View>
  );
}

function MailboxRow({ mailbox, title, accent }: { mailbox: Mailbox; title: string; accent?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const Icon = mailboxIcon(mailbox);
  return (
    <Item
      disabled={!mailbox.selectable}
      onPress={mailbox.selectable ? () => router.push(`/mailbox/${mailbox.id}`) : undefined}
      leading={
        <View style={[styles.leading, { paddingLeft: Math.min(mailbox.depth, 4) * 16 }]}>
          <Icon size={22} color={mailbox.selectable ? (accent ?? colors.primary) : colors.textTertiary} />
        </View>
      }
      title={
        <Typography numberOfLines={1} color={mailbox.selectable ? 'text' : 'secondary'}>
          {title}
        </Typography>
      }
      trailing={mailbox.selectable ? <CountAndChevron count={mailboxBadge(mailbox)} /> : undefined}
    />
  );
}

function AccountSection({ account, mailboxes }: { account: Account; mailboxes: Mailbox[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const authRequired = useSyncStore((state) => state.authRequired[account.id] === true);

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        onPress={() => setCollapsed((value) => !value)}
        style={styles.sectionHeader}
      >
        <View style={[styles.accountDot, { backgroundColor: accountColor(account.color) }]} />
        <Typography variant="h4" numberOfLines={1} style={styles.flex}>
          {account.displayName}
        </Typography>
        {collapsed ? <ChevronRight size={20} color={colors.textSecondary} /> : <ChevronDown size={20} color={colors.textSecondary} />}
      </Pressable>
      {authRequired ? (
        <Pressable onPress={() => router.push(`/settings/account/${account.id}`)} style={[styles.warning, { backgroundColor: colors.surface }]}>
          <TriangleAlert size={18} color={colors.warning} />
          <Typography variant="caption" style={styles.flex}>
            {t('accounts.reconnectRequired')}
          </Typography>
        </Pressable>
      ) : null}
      {collapsed ? null : mailboxes.length === 0 ? (
        <Typography variant="caption" color="secondary" style={styles.loadingFolders}>
          {t('mailboxes.loadingFolders')}
        </Typography>
      ) : (
        <List>
          {mailboxes.map((mailbox) => (
            <MailboxRow key={mailbox.id} mailbox={mailbox} title={mailboxName(mailbox, t)} />
          ))}
        </List>
      )}
    </View>
  );
}

export default function MailboxesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const mailboxes = useMailboxes();
  const syncLabel = useSyncLabel(accounts.map((account) => account.id));

  const mailboxesByAccount = useMemo(() => {
    const grouped = new Map<string, Mailbox[]>();
    for (const mailbox of mailboxes) grouped.set(mailbox.accountId, [...(grouped.get(mailbox.accountId) ?? []), mailbox]);
    return grouped;
  }, [mailboxes]);
  const inboxes = mailboxes.filter((mailbox) => mailbox.role === MailboxRole.Inbox);
  const unifiedUnread = inboxes.reduce((total, inbox) => total + inbox.unreadCount, 0);

  useEffect(() => {
    if (accounts.length > 0 && !unifiedInboxOpened) {
      unifiedInboxOpened = true;
      router.push(`/mailbox/${UNIFIED_SCOPE}`);
    }
  }, [accounts.length, router]);

  if (accounts.length === 0) return <Redirect href="/onboarding" />;

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.toolbar}>
          <IconButton round glass size={40} accessibilityLabel={t('settings.title')} onPress={() => router.push('/settings')}>
            <Settings size={20} color={colors.text} />
          </IconButton>
        </View>
        <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
          <Typography variant="h1">{t('mailboxes.title')}</Typography>
          {syncLabel ? (
            <Typography color="secondary" style={styles.subtitle}>
              {syncLabel}
            </Typography>
          ) : null}
          <List style={styles.inboxes}>
            <Item
              onPress={() => router.push(`/mailbox/${UNIFIED_SCOPE}`)}
              leading={<Inbox size={22} color={colors.primary} />}
              title={t('mailboxes.allInboxes')}
              trailing={<CountAndChevron count={unifiedUnread} />}
            />
            {accounts.map((account) => {
              const inbox = inboxes.find((mailbox) => mailbox.accountId === account.id);
              return inbox ? (
                <MailboxRow key={inbox.id} mailbox={inbox} title={account.displayName} accent={accountColor(account.color)} />
              ) : null;
            })}
          </List>
          {accounts.map((account) => (
            <AccountSection key={account.id} account={account} mailboxes={mailboxesByAccount.get(account.id) ?? []} />
          ))}
        </ScrollView>
      </SafeAreaView>
      <BottomBar />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 4 },
  content: { paddingHorizontal: 16, paddingBottom: 120, width: '100%', maxWidth: 700, alignSelf: 'center' },
  subtitle: { marginBottom: 12 },
  inboxes: { marginTop: 4 },
  section: { marginTop: 28, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  accountDot: { width: 10, height: 10, borderRadius: 5 },
  leading: { minWidth: 26, alignItems: 'flex-start', justifyContent: 'center' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  loadingFolders: { paddingHorizontal: 4 },
});
