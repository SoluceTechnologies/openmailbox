import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Link } from 'expo-router';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTranslation } from 'react-i18next';
import { Archive, Ellipsis, Flag, FlagOff, Mail, MailOpen, Trash2, type LucideIcon } from 'lucide-react-native';
import type { ThreadSummary } from '@openmailbox/mail-core';

import { Typography } from '@/ui/components';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { haptic } from '@/utils/haptics';

import { THREAD_ACTION_PRESENTATION, type ThreadActionId } from '../threadActions';

import { ThreadRow } from './ThreadRow';

const ACTION_WIDTH = 80;
const FULL_SWIPE = 0.55;
const MENU_ORDER: ThreadActionId[] = [
  'reply', 'replyAll', 'forward', 'print', 'markRead', 'markUnread', 'flag', 'unflag',
  'move', 'categorize', 'archive', 'moveToInbox', 'junk', 'notJunk', 'delete',
];

type Side = 'left' | 'right';

interface SwipeActionItem {
  label: string;
  Icon: LucideIcon;
  color: string;
  onPress: () => void;
}

interface SwipeActionProps extends SwipeActionItem {
  side: Side;
  index: number;
  count: number;
  translation: SharedValue<number>;
  armed: SharedValue<number>;
}

function SwipeAction({ label, Icon, color, onPress, side, index, count, translation, armed }: SwipeActionProps) {
  const edge = index === count - 1;
  const position = useAnimatedStyle(() => {
    const revealed = side === 'right' ? -translation.value : translation.value;
    const slot = Math.max(revealed, count * ACTION_WIDTH) / count;
    const inset = slot * (count - index + (edge ? armed.value * (count - 1) : 0));
    return { transform: [{ translateX: side === 'right' ? -inset : inset }] };
  });
  return (
    <Animated.View style={[styles.layer, side === 'right' ? styles.trailing : styles.leading, position]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={[styles.action, { backgroundColor: color, alignItems: side === 'right' ? 'flex-start' : 'flex-end' }]}
      >
        <View style={styles.content}>
          <Icon size={22} color="#ffffff" />
          <Typography variant="caption" color="light" numberOfLines={1}>
            {label}
          </Typography>
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface SwipeActionsProps {
  side: Side;
  items: SwipeActionItem[];
  translation: SharedValue<number>;
  hidden: boolean;
  onArm: (side: Side | null) => void;
}

function SwipeActions({ side, items, translation, hidden, onArm }: SwipeActionsProps) {
  const frame = useAnimatedRef<Animated.View>();
  const armed = useSharedValue(0);
  const width = items.length * ACTION_WIDTH;
  useAnimatedReaction(
    () => {
      const revealed = side === 'right' ? -translation.value : translation.value;
      if (revealed <= width) return false;
      const rowWidth = measure(frame)?.width;
      return rowWidth !== undefined && revealed > Math.max(rowWidth * FULL_SWIPE, width + ACTION_WIDTH / 2);
    },
    (now, before) => {
      if (before === null || now === before) return;
      armed.value = withTiming(now ? 1 : 0, { duration: 150 });
      scheduleOnRN(onArm, now ? side : null);
    },
  );
  return (
    <>
      <Animated.View ref={frame} aria-hidden={hidden} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {items.map((item, index) => (
          <SwipeAction key={index} {...item} side={side} index={index} count={items.length} translation={translation} armed={armed} />
        ))}
      </Animated.View>
      <View style={{ width }} />
    </>
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
  children?: ReactNode;
}

function SwipeableThreadRowImpl({ thread, accountAccent, canArchive, menuActions, onOpen, onLongPress, onAction, onMore, selected, children }: SwipeableThreadRowProps) {
  const { t } = useTranslation();
  const swipeable = useRef<SwipeableMethods>(null);
  const selecting = selected !== undefined;

  useEffect(() => {
    swipeable.current?.reset();
  }, [thread.key]);

  useEffect(() => {
    if (selecting) swipeable.current?.close();
  }, [selecting]);

  const actions = useMemo(() => {
    const unread = thread.unreadCount > 0;
    const close = (then: () => void) => () => {
      swipeable.current?.close();
      then();
    };
    const act = (action: ThreadActionId) => close(() => onAction(action, thread));
    const flag: ThreadActionId = thread.isFlagged ? 'unflag' : 'flag';
    const left: SwipeActionItem[] = [
      {
        label: unread ? t('threads.markRead') : t('threads.markUnread'),
        Icon: unread ? MailOpen : Mail,
        color: '#109be6',
        onPress: act(unread ? 'markRead' : 'markUnread'),
      },
    ];
    const right: SwipeActionItem[] = [
      { label: t('threads.more'), Icon: Ellipsis, color: '#8e8e93', onPress: close(() => onMore(thread)) },
      { label: t(`threads.${flag}`), Icon: thread.isFlagged ? FlagOff : Flag, color: '#ff9500', onPress: act(flag) },
      canArchive
        ? { label: t('threads.archive'), Icon: Archive, color: '#af52de', onPress: act('archive') }
        : { label: t('threads.delete'), Icon: Trash2, color: '#ff3b30', onPress: act('delete') },
    ];
    return { left, right };
  }, [t, thread, canArchive, onAction, onMore]);

  const fullSwipe = useRef<Side | null>(null);
  const onArm = useCallback((side: Side | null) => {
    fullSwipe.current = side;
    if (side) haptic();
  }, []);
  const onWillOpen = (direction: SwipeDirection) => {
    const side: Side = direction === SwipeDirection.RIGHT ? 'left' : 'right';
    if (fullSwipe.current === side) actions[side][actions[side].length - 1].onPress();
    else haptic();
  };

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      enabled={!selecting}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      onSwipeableWillOpen={onWillOpen}
      renderLeftActions={(_, translation) => (
        <SwipeActions side="left" items={actions.left} translation={translation} hidden={selecting} onArm={onArm} />
      )}
      renderRightActions={(_, translation) => (
        <SwipeActions side="right" items={actions.right} translation={translation} hidden={selecting} onArm={onArm} />
      )}
    >
      {NATIVE_CHROME && menuActions ? (
        <Link href={{ pathname: '/thread/[threadId]', params: { threadId: thread.threadId, mailboxId: thread.mailboxId } }} asChild>
          <Link.Trigger>
            {children ?? <ThreadRow thread={thread} accountAccent={accountAccent} onOpen={onOpen} />}
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
        children ?? <ThreadRow thread={thread} accountAccent={accountAccent} onOpen={onOpen} onLongPress={selecting ? undefined : onLongPress} selected={selected} />
      )}
    </ReanimatedSwipeable>
  );
}

export const SwipeableThreadRow = memo(SwipeableThreadRowImpl);

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, bottom: 0, width: '100%' },
  trailing: { left: '100%' },
  leading: { right: '100%' },
  action: { flex: 1, justifyContent: 'center' },
  content: { width: ACTION_WIDTH, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
});
