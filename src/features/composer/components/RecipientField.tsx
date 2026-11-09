import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CirclePlus, X } from 'lucide-react-native';

import { ContactAvatar } from '@/features/avatars/ContactAvatar';
import { pickContactAddress } from '@/services/contacts';
import { Typography } from '@/ui/components';
import { parseAddressList, type MailAddress } from '@/utils/addresses';

import { useRecipientSuggestions } from '../useRecipientSuggestions';

const SEPARATOR = /[,;\n]$/;
const VISIBLE_SUGGESTIONS = 5;

interface RecipientFieldProps {
  label: string;
  value: MailAddress[];
  onChange: (addresses: MailAddress[]) => void;
  /** What is typed and not yet turned into a chip. */
  text: string;
  onTextChange: (text: string) => void;
  autoFocus?: boolean;
}

export function RecipientField({ label, value, onChange, text, onTextChange, autoFocus }: RecipientFieldProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const name = label.replace(/\s*:$/, '');
  const chosen = new Set(value.map((address) => address.email.toLowerCase()));
  const suggestions = useRecipientSuggestions(text)
    .filter((address) => !chosen.has(address.email.toLowerCase()))
    .slice(0, VISIBLE_SUGGESTIONS);

  const add = (addresses: MailAddress[]) => {
    onChange([...value, ...addresses.filter((address) => !chosen.has(address.email.toLowerCase()))]);
    onTextChange('');
  };

  const commit = (candidate: string) => {
    const parsed = parseAddressList(candidate);
    if (parsed.addresses.length > 0 && parsed.invalid.length === 0) add(parsed.addresses);
    else onTextChange(candidate);
  };

  const changeText = (next: string) => (SEPARATOR.test(next) ? commit(next.slice(0, -1)) : onTextChange(next));

  const pickContact = async () => {
    const address = await pickContactAddress().catch(() => null);
    if (address) add([address]);
  };

  return (
    <View>
      <View style={[styles.field, { borderBottomColor: colors.border }]}>
        <Typography color="secondary" style={styles.label}>
          {label}
        </Typography>
        <View style={styles.chips}>
          {value.map((address) => {
            const shown = address.name || address.email;
            return (
              <Pressable
                key={address.email}
                accessibilityRole="button"
                accessibilityLabel={t('compose.removeRecipient', { name: shown })}
                onPress={() => onChange(value.filter((candidate) => candidate !== address))}
                style={[styles.chip, { backgroundColor: `${colors.primary}1a` }]}
              >
                <Typography variant="body2" weight="500" color={colors.primary} numberOfLines={1}>
                  {shown}
                </Typography>
                <X size={13} color={colors.primary} />
              </Pressable>
            );
          })}
          <TextInput
            value={text}
            onChangeText={changeText}
            onSubmitEditing={() => text.trim() && commit(text)}
            onBlur={() => text.trim() && commit(text)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && text === '' && value.length > 0) onChange(value.slice(0, -1));
            }}
            accessibilityLabel={name}
            autoFocus={autoFocus}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            blurOnSubmit={false}
            style={[styles.input, { color: colors.text }]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('compose.addFromContacts')}
          hitSlop={8}
          onPress={() => void pickContact()}
        >
          <CirclePlus size={22} color={colors.primary} />
        </Pressable>
      </View>
      {suggestions.map((address) => (
        <Pressable
          key={address.email}
          accessibilityRole="button"
          onPress={() => add([address])}
          style={({ pressed }) => [styles.suggestion, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.surface }]}
        >
          <ContactAvatar email={address.email} name={address.name || address.email} size={32} />
          <View style={styles.suggestionText}>
            {address.name ? (
              <Typography weight="500" numberOfLines={1}>
                {address.name}
              </Typography>
            ) : null}
            <Typography variant="caption" color="secondary" numberOfLines={1}>
              {address.email}
            </Typography>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { alignSelf: 'flex-start', paddingTop: 14 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingVertical: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  input: { flexGrow: 1, minWidth: 90, fontSize: 16, paddingVertical: 6 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionText: { flex: 1, gap: 2 },
});
