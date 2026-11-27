import { memo, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CalendarDays } from 'lucide-react-native';
import type { Attachment } from '@openmailbox/mail-core';

import { sendDraft } from '@/core/actions';
import { useAccounts } from '@/core/hooks';
import { sendersOf, type Sender } from '@/features/composer/senders';
import { useSettingsStore, type Signature } from '@/stores/settingsStore';
import { Button, Typography } from '@/ui/components';
import { formatDay, formatTime } from '@/utils/dates';

import { addInviteEvent, removeInviteEvent } from './calendar';
import { canAnswer, parseInvite, replyIcs, type Answer, type Invite } from './invite';

const ANSWERS: Answer[] = ['ACCEPTED', 'TENTATIVE', 'DECLINED'];
const LABELS: Record<Answer, string> = { ACCEPTED: 'invites.accept', TENTATIVE: 'invites.maybe', DECLINED: 'invites.decline' };
const DAY = 86_400_000;
const NO_SIGNATURES: Record<string, Signature> = {};

export function isCalendarFile(attachment: Attachment): boolean {
  return (
    attachment.mimeType === 'text/calendar' || attachment.mimeType === 'application/ics' || attachment.filename.toLowerCase().endsWith('.ics')
  );
}

export function useInvite(calendar: string | undefined, accountId: string | undefined) {
  const accounts = useAccounts();
  const identities = useSettingsStore((state) => state.identities);
  const senders = useMemo(
    () => sendersOf(accounts.filter((account) => account.id === accountId), identities, NO_SIGNATURES),
    [accounts, identities, accountId],
  );
  const invite = useMemo(
    () => (calendar && accountId ? parseInvite(calendar, senders.map((sender) => sender.email)) : null),
    [calendar, accountId, senders],
  );
  return { invite, senders };
}

function dateLine(invite: Invite, t: TFunction): string {
  const start = invite.start.getTime();
  const end = invite.end.getTime();
  if (invite.allDay) {
    const last = end - DAY;
    return last > start ? `${formatDay(start)} – ${formatDay(last)}` : `${formatDay(start)} · ${t('invites.allDay')}`;
  }
  if (new Date(start).toDateString() === new Date(end).toDateString()) {
    return `${formatDay(start)} · ${formatTime(start)} – ${formatTime(end)}`;
  }
  return `${formatDay(start)} ${formatTime(start)} – ${formatDay(end)} ${formatTime(end)}`;
}

interface InviteCardProps {
  emailId: string;
  accountId: string;
  source: string;
  invite: Invite;
  senders: Sender[];
}

function InviteCardImpl({ emailId, accountId, source, invite, senders }: InviteCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const stored = useSettingsStore((state) => state.inviteAnswers[invite.uid]);
  const eventId = useSettingsStore((state) => state.inviteEvents[invite.uid]);
  const setInviteAnswer = useSettingsStore((state) => state.setInviteAnswer);
  const [busy, setBusy] = useState(false);
  const [notAdded, setNotAdded] = useState(false);
  const outdated = stored !== undefined && stored.sequence < invite.sequence;
  const answered = stored && !outdated ? stored.partstat : !stored && invite.me?.partstat !== 'NEEDS-ACTION' ? invite.me?.partstat : undefined;
  const answer = answered === 'NEEDS-ACTION' ? undefined : answered;
  const answerable = invite.organizer !== undefined && canAnswer(invite, new Date());
  const organizer = invite.organizer ? invite.organizer.name || invite.organizer.email : undefined;
  const replier = invite.replier && invite.replier.partstat !== 'NEEDS-ACTION' ? invite.replier : undefined;

  const banner =
    invite.method === 'CANCEL'
      ? t('invites.cancelled')
      : invite.method === 'REPLY'
        ? replier
          ? t(`invites.replied.${replier.partstat}`, { name: replier.address.name || replier.address.email })
          : undefined
        : outdated
          ? t('invites.updated')
          : answer && answerable
            ? t(`invites.answer.${answer}`)
            : undefined;

  const respond = async (partstat: Answer) => {
    if (!invite.me || !invite.organizer) return;
    const sender = senders.find((candidate) => candidate.email.toLowerCase() === invite.me!.address.email.toLowerCase());
    const me = { name: sender?.name ?? invite.me.address.name, email: invite.me.address.email };
    setBusy(true);
    setNotAdded(false);
    try {
      await sendDraft({
        accountId,
        to: [invite.organizer],
        cc: [],
        bcc: [],
        subject: t(`invites.subject.${partstat}`, { summary: invite.summary }),
        bodyText: t(`invites.body.${partstat}`, { name: me.name || me.email }),
        bodyHtml: undefined,
        inReplyToEmailId: emailId,
        attachments: [],
        from: sender?.identity ? { name: sender.name, email: sender.email } : undefined,
        calendar: replyIcs(source, me, partstat, new Date()),
      });
    } catch {
      Alert.alert(t('invites.sendFailed'));
      setBusy(false);
      return;
    }
    setInviteAnswer(invite.uid, invite.sequence, partstat);
    if (partstat === 'DECLINED') await removeInviteEvent(invite.uid);
    else setNotAdded((await addInviteEvent(invite).catch(() => 'unavailable')) !== 'added');
    setBusy(false);
  };

  const addToCalendar = async () => setNotAdded((await addInviteEvent(invite).catch(() => 'unavailable')) !== 'added');
  const calendarAction =
    invite.method === 'REPLY' ? null : eventId ? (
      <Button variant="link" title={t('invites.removeFromCalendar')} onPress={() => void removeInviteEvent(invite.uid)} />
    ) : invite.method !== 'CANCEL' && !answerable ? (
      <Button variant="link" title={t('invites.addToCalendar')} onPress={() => void addToCalendar()} />
    ) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <CalendarDays size={22} color={colors.primary} />
        <View style={styles.details}>
          <Typography variant="title" numberOfLines={2}>
            {invite.summary}
          </Typography>
          <Typography variant="caption" color="secondary">
            {dateLine(invite, t)}
          </Typography>
          {invite.location ? (
            <Typography variant="caption" color="secondary">
              {invite.location}
            </Typography>
          ) : null}
          {organizer && invite.method !== 'REPLY' ? (
            <Typography variant="caption" color="secondary">
              {t('invites.from', { name: organizer })}
            </Typography>
          ) : null}
          {invite.repeat ? (
            <Typography variant="caption" color="secondary">
              {t(`invites.repeats.${invite.repeat.frequency.toLowerCase()}`, { count: invite.repeat.interval })}
            </Typography>
          ) : null}
        </View>
      </View>
      {banner ? (
        <Typography variant="body2" weight="500">
          {banner}
        </Typography>
      ) : null}
      {answerable ? (
        <View style={styles.answers}>
          {ANSWERS.map((partstat) => {
            const selected = answer === partstat;
            return (
              <Pressable
                key={partstat}
                accessibilityRole="button"
                accessibilityLabel={t(LABELS[partstat])}
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy}
                onPress={() => void respond(partstat)}
                style={[styles.answer, { backgroundColor: selected ? colors.primary : colors.chip }]}
              >
                <Typography weight="600" color={selected ? 'light' : colors.primary}>
                  {t(LABELS[partstat])}
                </Typography>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {calendarAction}
      {notAdded ? (
        <Typography variant="caption" color="secondary">
          {t('invites.notAdded')}
        </Typography>
      ) : null}
    </View>
  );
}

export const InviteCard = memo(InviteCardImpl);

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 14 },
  header: { flexDirection: 'row', gap: 12 },
  details: { flex: 1, gap: 2 },
  answers: { flexDirection: 'row', gap: 8 },
  answer: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999 },
});
