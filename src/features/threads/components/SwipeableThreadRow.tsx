import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';
import { Archive, Mail, MailOpen, Trash2, type LucideIcon } from 'lucide-react-native';
import type { ThreadSummary } from '@openmailbox/mail-core';

import { archiveThread, setThreadRead, trashThread } from '@/core/actions';
import { Typography } from '@/ui/components';

import { ThreadRow } from './ThreadRow';

const ACTION_WIDTH = 80;

interface SwipeActionProps {
  label: string;
  Icon: LucideIcon;
  color: string;
  onPress: () => void;
}

function SwipeAction({ label, Icon, color, onPress }: SwipeActionProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.action, { backgroundColor: color }]}>
      <Icon size={22} color="#ffffff" />
      <Typography variant="caption" color="light" numberOfLines={1}>
        {label}
      </Typography>
    </Pressable>
  );
}

interface SwipeableThreadRowProps {
  thread: ThreadSummary;
  accountAccent?: string;
  canArchive: boolean;
  onOpen: (thread: ThreadSummary) => void;
}

function SwipeableThreadRowImpl({ thread, accountAccent, canArchive, onOpen }: SwipeableThreadRowProps) {
  const { t } = useTranslation();
  const swipeable = useRef<SwipeableMethods>(null);
  const unread = thread.unreadCount > 0;

  useEffect(() => {
    swipeable.current?.reset();
  }, [thread.key]);

  const run = (action: () => Promise<void>) => () => {
    swipeable.current?.close();
    action().catch(() => undefined);
  };

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={1.5}
      overshootFriction={8}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      renderLeftActions={() => (
        <SwipeAction
          label={unread ? t('threads.markRead') : t('threads.markUnread')}
          Icon={unread ? MailOpen : Mail}
          color="#007aff"
          onPress={run(() => setThreadRead(thread, unread))}
        />
      )}
      renderRightActions={() => (
        <View style={styles.actions}>
          {canArchive ? <SwipeAction label={t('threads.archive')} Icon={Archive} color="#af52de" onPress={run(() => archiveThread(thread))} /> : null}
          <SwipeAction label={t('threads.trash')} Icon={Trash2} color="#ff3b30" onPress={run(() => trashThread(thread))} />
        </View>
      )}
    >
      <ThreadRow thread={thread} accountAccent={accountAccent} onOpen={onOpen} />
    </ReanimatedSwipeable>
  );
}

export const SwipeableThreadRow = memo(SwipeableThreadRowImpl);

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
});
