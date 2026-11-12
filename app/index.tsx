import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Inbox, Settings, TriangleAlert } from 'lucide-react-native';
import { MailboxRole, type Account, type Mailbox } from '@openmailbox/mail-core';

import { BottomBar } from '@/components/BottomBar';
import { useAccounts, useMailboxes } from '@/core/hooks';
import { UNIFIED_SCOPE } from '@/core/queryClient';
import { accountName } from '@/features/accounts/accountName';
import { mailboxBadge, mailboxIcon, mailboxName, visibleFolders } from '@/features/mailboxes/mailboxPresentation';
import { SearchResults } from '@/features/search/SearchResults';
import { useSyncLabel } from '@/features/sync/useSyncLabel';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import { accountColor } from '@/theme';
import { FormSection, IconButton, ListRow, Typography, ViewContainer } from '@/ui/components';
import { LIQUID_GLASS, NATIVE_CHROME, translucentHeader } from '@/ui/nativeChrome';

let unifiedInboxOpened = false;

interface MailboxRowProps {
  mailbox: Mailbox;
  title: string;
  accent?: string;
  expanded?: boolean;
  onToggle?: () => void;
}

function MailboxRow({ mailbox, title, accent, expanded, onToggle }: MailboxRowProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const Icon = mailboxIcon(mailbox);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <ListRow
      title={title}
      disabled={!mailbox.selectable}
      detail={mailbox.selectable ? mailboxBadge(mailbox) : undefined}
      chevron={!onToggle}
      trailing={
        onToggle ? (
          <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }} hitSlop={12} onPress={onToggle}>
            <Chevron size={18} color={colors.textSecondary} />
          </Pressable>
        ) : undefined
      }
      onPress={mailbox.selectable ? () => router.push(`/mailbox/${mailbox.id}`) : undefined}
      leading={
        <View style={{ paddingLeft: Math.min(mailbox.depth, 3) * 18 }}>
          <Icon size={22} color={mailbox.selectable ? (accent ?? colors.primary) : colors.textTertiary} />
        </View>
      }
    />
  );
}

function AccountSection({ account, name, mailboxes }: { account: Account; name: string; mailboxes: Mailbox[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const collapsedIds = useSettingsStore((state) => state.collapsedIds);
  const toggleCollapsed = useSettingsStore((state) => state.toggleCollapsed);
  const folders = useMemo(() => visibleFolders(mailboxes, collapsedIds), [mailboxes, collapsedIds]);
  const authRequired = useSyncStore((state) => state.authRequired[account.id] === true);
  const collapsed = collapsedIds.includes(account.id);
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        onPress={() => toggleCollapsed(account.id)}
        style={styles.sectionHeader}
      >
        <View style={[styles.accountDot, { backgroundColor: accountColor(account.color) }]} />
        <Typography variant="h4" numberOfLines={1} style={styles.flex}>
          {name}
        </Typography>
        <Chevron size={20} color={colors.textSecondary} />
      </Pressable>
      {authRequired ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/settings/account/${account.id}`)}
          style={[styles.warning, { backgroundColor: `${colors.warning}1f` }]}
        >
          <TriangleAlert size={18} color={colors.warning} />
          <Typography variant="caption" color={colors.text} style={styles.flex}>
            {t('accounts.reconnectRequired')}
          </Typography>
        </Pressable>
      ) : null}
      {collapsed ? null : mailboxes.length === 0 ? (
        <Typography variant="caption" color={colors.textSecondary} style={styles.loadingFolders}>
          {t('mailboxes.loadingFolders')}
        </Typography>
      ) : (
        <FormSection>
          {folders.map(({ mailbox, parent }) => (
            <MailboxRow
              key={mailbox.id}
              mailbox={mailbox}
              title={mailboxName(mailbox, t)}
              expanded={parent ? !collapsedIds.includes(mailbox.id) : undefined}
              onToggle={parent ? () => toggleCollapsed(mailbox.id) : undefined}
            />
          ))}
        </FormSection>
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
  const accountNames = useSettingsStore((state) => state.accountNames);
  const syncLabel = useSyncLabel(accounts.map((account) => account.id));
  const [query, setQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);

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

  const list =
    searchActive || query.trim().length > 1 ? (
      <SearchResults query={query} />
    ) : (
      <ScrollView
        style={{ backgroundColor: colors.groupedBackground }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.header}>
          {NATIVE_CHROME ? null : <Typography variant="h1">{t('mailboxes.title')}</Typography>}
          {syncLabel ? (
            <Typography variant="caption" color={colors.textSecondary} style={styles.subtitle}>
              {syncLabel}
            </Typography>
          ) : null}
        </View>
        <FormSection>
          <ListRow
            title={t('mailboxes.allInboxes')}
            detail={unifiedUnread}
            leading={<Inbox size={22} color={colors.primary} />}
            onPress={() => router.push(`/mailbox/${UNIFIED_SCOPE}`)}
          />
          {accounts.map((account) => {
            const inbox = inboxes.find((mailbox) => mailbox.accountId === account.id);
            return inbox ? (
              <MailboxRow key={inbox.id} mailbox={inbox} title={accountName(account, accountNames)} accent={accountColor(account.color)} />
            ) : null;
          })}
        </FormSection>
        {accounts.map((account) => (
          <AccountSection
            key={account.id}
            account={account}
            name={accountName(account, accountNames)}
            mailboxes={mailboxesByAccount.get(account.id) ?? []}
          />
        ))}
      </ScrollView>
    );

  if (NATIVE_CHROME) {
    return (
      <>
        {list}
        <Stack.Screen
          options={{
            headerShown: true,
            title: t('mailboxes.title'),
            headerLargeTitle: true,
            ...translucentHeader(colors.groupedBackground),
            headerShadowVisible: false,
          }}
        />
        <Stack.SearchBar
          placeholder={t('search.placeholder')}
          hideWhenScrolling={false}
          onChangeText={(event) => setQuery(event.nativeEvent.text)}
          onFocus={() => setSearchActive(true)}
          onCancelButtonPress={() => {
            setQuery('');
            setSearchActive(false);
          }}
        />
        <Stack.Toolbar placement="right">
          {LIQUID_GLASS ? null : (
            <Stack.Toolbar.Button icon="square.and.pencil" accessibilityLabel={t('compose.newMessage')} onPress={() => router.push('/compose')} />
          )}
          <Stack.Toolbar.Button icon="gearshape" accessibilityLabel={t('settings.title')} onPress={() => router.push('/settings')} />
        </Stack.Toolbar>
        {LIQUID_GLASS ? (
          <Stack.Toolbar placement="bottom">
            <Stack.Toolbar.SearchBarSlot />
            <Stack.Toolbar.Spacer />
            <Stack.Toolbar.Button icon="square.and.pencil" accessibilityLabel={t('compose.newMessage')} onPress={() => router.push('/compose')} />
          </Stack.Toolbar>
        ) : null}
      </>
    );
  }

  return (
    <ViewContainer grouped>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.toolbar}>
          <IconButton round glass size={40} accessibilityLabel={t('settings.title')} onPress={() => router.push('/settings')}>
            <Settings size={20} color={colors.text} />
          </IconButton>
        </View>
        {list}
      </SafeAreaView>
      <BottomBar />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, minHeight: 52, alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 120, width: '100%', maxWidth: 700, alignSelf: 'center' },
  header: { marginLeft: 4, marginBottom: 16 },
  subtitle: { marginTop: 2, fontSize: 13 },
  section: { marginTop: 32, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  accountDot: { width: 8, height: 8, borderRadius: 4 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  loadingFolders: { paddingHorizontal: 4 },
});
