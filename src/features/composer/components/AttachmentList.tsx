import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Paperclip, X } from 'lucide-react-native';

import { Typography } from '@/ui/components';
import { formatSize } from '@/utils/sizes';

import type { ComposerAttachment } from '../attachments';

interface AttachmentListProps {
  attachments: ComposerAttachment[];
  onRemove: (attachment: ComposerAttachment) => void;
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (attachments.length === 0) return null;

  return (
    <View style={styles.list}>
      {attachments.map((attachment) => (
        <View key={attachment.path} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Paperclip size={16} color={colors.textSecondary} />
          <View style={styles.text}>
            <Typography variant="body2" weight="500" numberOfLines={1}>
              {attachment.filename}
            </Typography>
            <Typography variant="caption" color="secondary">
              {formatSize(attachment.size, t)}
            </Typography>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('compose.removeAttachment', { name: attachment.filename })}
            hitSlop={10}
            onPress={() => onRemove(attachment)}
          >
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingVertical: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  text: { flex: 1 },
});
