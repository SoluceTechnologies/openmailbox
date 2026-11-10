import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';
import { Archive, Ellipsis, Flag, FlagOff, Mail, MailOpen, Trash2, type LucideIcon } from 'lucide-react-native';
import type { ThreadSummary } from '@openmailbox/mail-core';

import { Typography } from '@/ui/components';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { haptic } from '@/utils/haptics';

import { THREAD_ACTION_PRESENTATION, type ThreadActionId } from '../threadActions';

import { ThreadRow } from './ThreadRow';

const ACTION_WIDTH = 80;
const MENU_ORDER: ThreadActionId[] = [
  'reply', 'replyAll', 'forward', 'markRead', 'markUnread', 'flag', 'unflag',
  'move', 'archive', 'moveToInbox', 'junk', 'notJunk', 'delete',
];

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
  menuActions?: ThreadActionId[];
  onOpen: (thread: ThreadSummary) => void;
  onLongPress?: (thread: ThreadSummary) => void;
  onAction: (action: ThreadActionId, thread: ThreadSummary) => void;
  onMore: (thread: ThreadSummary) => void;
  selected?: boolean;
}

function SwipeableThreadRowImpl({ thread, accountAccent, canArchive, menuActions, onOpen, onLongPress, onAction, onMore, selected }: SwipeableThreadRowProps) {
  const { t } = useTranslation();
  const swipeable = useRef<SwipeableMethods>(null);
  const unread = thread.unreadCount > 0;

  useEffect(() => {
    swipeable.current?.reset();
  }, [thread.key]);

  const close = (then: () => void) => () => {
    swipeable.current?.close();
    then();
  };
  const act = (action: ThreadActionId) => close(() => onAction(action, thread));
  const flag: ThreadActionId = thread.isFlagged ? 'unflag' : 'flag';

  if (selected !== undefined) {
    return <ThreadRow thread={thread} accountAccent={accountAccent} onOpen={onOpen} selected={selected} />;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={1.5}
      overshootFriction={8}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      onSwipeableWillOpen={() => haptic()}
      renderLeftActions={() => (
        <SwipeAction
          label={unread ? t('threads.markRead') : t('threads.markUnread')}
          Icon={unread ? MailOpen : Mail}
          color="#109be6"
          onPress={act(unread ? 'markRead' : 'markUnread')}
        />
      )}
      renderRightActions={() => (
        <View style={styles.actions}>
          <SwipeAction label={t('threads.more')} Icon={Ellipsis} color="#8e8e93" onPress={close(() => onMore(thread))} />
          <SwipeAction label={t(`threads.${flag}`)} Icon={thread.isFlagged ? FlagOff : Flag} color="#ff9500" onPress={act(flag)} />
          {canArchive ? (
            <SwipeAction label={t('threads.archive')} Icon={Archive} color="#af52de" onPress={act('archive')} />
          ) : (
            <SwipeAction label={t('threads.delete')} Icon={Trash2} color="#ff3b30" onPress={act('delete')} />
          )}
        </View>
      )}
    >
      {NATIVE_CHROME && menuActions ? (
        <Link href={{ pathname: '/thread/[threadId]', params: { threadId: thread.threadId, mailboxId: thread.mailboxId } }} asChild>
          <Link.Trigger>
            <ThreadRow thread={thread} accountAccent={accountAccent} onOpen={onOpen} />
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            {MENU_ORDER.filter((action) => menuActions.includes(action)).map((action) => {
              const { label, symbol, destructive } = THREAD_ACTION_PRESENTATION[action];
              return (
                <Link.MenuAction
                  key={action}
                  title={t(label)}
                  icon={symbol}
                  destructive={destructive}
                  onPress={() => onAction(action, thread)}
                />
              );
            })}
          </Link.Menu>
        </Link>
      ) : (
        <ThreadRow thread={thread} accountAccent={accountAccent} onOpen={onOpen} onLongPress={onLongPress} />
      )}
    </ReanimatedSwipeable>
  );
}

export const SwipeableThreadRow = memo(SwipeableThreadRowImpl);

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
});
