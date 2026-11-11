import { View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Mailbox } from '@openmailbox/mail-core';

import { useMailboxes } from '@/core/hooks';
import { FormSection, ListRow, Sheet } from '@/ui/components';

import { mailboxIcon, mailboxName } from '../mailboxPresentation';

interface MailboxPickerProps {
  accountId?: string;
  excludeMailboxId?: string;
  visible: boolean;
  onSelect: (mailbox: Mailbox) => void;
  onClose: () => void;
}

export function MailboxPicker({ accountId, excludeMailboxId, visible, onSelect, onClose }: MailboxPickerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const folders = useMailboxes().filter((mailbox) => mailbox.accountId === accountId && mailbox.id !== excludeMailboxId);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('threads.move')}>
      <FormSection>
        {folders.map((mailbox) => {
          const Icon = mailboxIcon(mailbox);
          return (
            <ListRow
              key={mailbox.id}
              title={mailboxName(mailbox, t)}
              disabled={!mailbox.selectable}
              chevron={false}
              onPress={() => {
                onClose();
                onSelect(mailbox);
              }}
              leading={
                <View style={{ paddingLeft: Math.min(mailbox.depth, 3) * 18 }}>
                  <Icon size={22} color={mailbox.selectable ? colors.primary : colors.textTertiary} />
                </View>
              }
            />
          );
        })}
      </FormSection>
    </Sheet>
  );
}
