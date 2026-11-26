import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type AccessibilityActionEvent, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check, CirclePlus, Info } from 'lucide-react-native';

import { ContactAvatar } from '@/features/avatars/ContactAvatar';
import { pickContactAddress, showContactCard } from '@/services/contacts';
import { Typography } from '@/ui/components';
import { parseAddressList, type MailAddress } from '@/utils/addresses';

import { useRecipientSuggestions } from '../useRecipientSuggestions';

const SEPARATOR = /[,;\n]$/;
const VISIBLE_SUGGESTIONS = 5;
const SUMMARY_GAP = 4;

const sameEmail = (first: MailAddress, second: MailAddress) => first.email.toLowerCase() === second.email.toLowerCase();
const shownName = (address: MailAddress) => address.name || address.email;
const sameName = (first: string | undefined, second: string | undefined) =>
  !!first && !!second && first.trim().toLowerCase() === second.trim().toLowerCase();

interface RecipientFieldProps {
  label: string;
  value: MailAddress[];
  onChange: (addresses: MailAddress[]) => void;
  text: string;
  onTextChange: (text: string) => void;
  inputAccessoryViewID?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
}

function RecipientSummary({ addresses, label, onPress }: { addresses: MailAddress[]; label: string; onPress: () => void }) {
  const { t } = useTranslation();
  const names = addresses.map(shownName);
  const [width, setWidth] = useState(0);
  const [ends, setEnds] = useState<number[]>([]);
  const [moreWidth, setMoreWidth] = useState(0);
  const measured = width > 0 && moreWidth > 0 && names.every((_, index) => ends[index] !== undefined);
  let shown = names.length;
  if (measured && ends[names.length - 1] > width) {
    shown = 1;
    while (shown < names.length - 1 && ends[shown] + SUMMARY_GAP + moreWidth <= width) shown += 1;
  }
  const segment = (name: string, index: number, last: number) => (index < last ? `${name},` : name);

  return (
    <Pressable
      testID="recipient-summary"
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${names.join(', ')}`}
      onPress={onPress}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.summary}
    >
      <View style={styles.summaryRow}>
        {names.slice(0, shown).map((name, index) => (
          <Typography key={index} numberOfLines={1} style={index === shown - 1 ? styles.shrink : styles.fixed}>
            {segment(name, index, shown - 1)}
          </Typography>
        ))}
        {shown < names.length ? (
          <Typography color="secondary" style={styles.fixed}>
            {t('compose.andMore', { count: names.length - shown })}
          </Typography>
        ) : null}
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.measure}>
        {names.map((name, index) => (
          <Typography
            key={index}
            testID={`recipient-summary-name-${index}`}
            style={styles.fixed}
            onLayout={({ nativeEvent: { layout } }) =>
              setEnds((current) => {
                const next = [...current];
                next[index] = layout.x + layout.width;
                return next;
              })
            }
          >
            {segment(name, index, names.length - 1)}
          </Typography>
        ))}
        <Typography testID="recipient-summary-more" style={styles.fixed} onLayout={(event) => setMoreWidth(event.nativeEvent.layout.width)}>
          {t('compose.andMore', { count: names.length })}
        </Typography>
      </View>
    </Pressable>
  );
}

function SelectedRecipient({ address, onSwap }: { address: MailAddress; onSwap: (next: MailAddress) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const others = useRecipientSuggestions(address.name ?? '').filter(
    (candidate) => sameName(candidate.name, address.name) && !sameEmail(candidate, address),
  );

  return (
    <View>
      <View style={[styles.suggestion, { borderBottomColor: colors.border }]}>
        <ContactAvatar email={address.email} name={shownName(address)} size={32} />
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reader.contactCard')}
          hitSlop={8}
          onPress={() => void showContactCard(address).catch(() => undefined)}
        >
          <Info size={20} color={colors.primary} />
        </Pressable>
      </View>
      {others.length > 0
        ? [address, ...others].map((candidate) => {
            const current = sameEmail(candidate, address);
            return (
              <Pressable
                key={candidate.email}
                accessibilityRole="button"
                accessibilityLabel={candidate.email}
                accessibilityState={{ selected: current }}
                onPress={() => onSwap(candidate)}
                style={({ pressed }) => [styles.address, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.surface }]}
              >
                <Typography numberOfLines={1} style={styles.shrink}>
                  {candidate.email}
                </Typography>
                {current ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

export function RecipientField({ label, value, onChange, text, onTextChange, autoFocus, inputAccessoryViewID, onFocus }: RecipientFieldProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus === true);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const name = label.replace(/\s*:$/, '');
  const chosen = new Set(value.map((address) => address.email.toLowerCase()));
  const suggestions = useRecipientSuggestions(text)
    .filter((address) => !chosen.has(address.email.toLowerCase()))
    .slice(0, VISIBLE_SUGGESTIONS);
  const selected = value.find((address) => address.email === selectedEmail);
  const folded = !focused && text === '' && value.length > 0;

  const add = (addresses: MailAddress[]) => {
    onChange([...value, ...addresses.filter((address) => !chosen.has(address.email.toLowerCase()))]);
    onTextChange('');
  };

  const commit = (candidate: string) => {
    const parsed = parseAddressList(candidate);
    if (parsed.addresses.length > 0 && parsed.invalid.length === 0) add(parsed.addresses);
    else onTextChange(candidate);
  };

  const remove = (address: MailAddress) => {
    setSelectedEmail(null);
    onChange(value.filter((candidate) => candidate !== address));
  };

  const swap = (current: MailAddress, next: MailAddress) => {
    setSelectedEmail(null);
    if (sameEmail(current, next)) return;
    const taken = value.some((candidate) => candidate !== current && sameEmail(candidate, next));
    onChange(taken ? value.filter((candidate) => candidate !== current) : value.map((candidate) => (candidate === current ? next : candidate)));
  };

  const toggle = (address: MailAddress) => {
    setSelectedEmail((current) => (current === address.email ? null : address.email));
    input.current?.focus();
  };

  const changeText = (next: string) => {
    setSelectedEmail(null);
    if (SEPARATOR.test(next)) commit(next.slice(0, -1));
    else onTextChange(next);
  };

  const keyPress = ({ nativeEvent }: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (nativeEvent.key !== 'Backspace' || text !== '') return;
    if (selected) remove(selected);
    else if (value.length > 0) setSelectedEmail(value[value.length - 1].email);
  };

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
        <View style={styles.tokens}>
          {folded ? (
            <RecipientSummary key={value.map(shownName).join('\n')} addresses={value} label={name} onPress={() => input.current?.focus()} />
          ) : (
            value.map((address) => {
              const isSelected = address.email === selectedEmail;
              return (
                <Pressable
                  key={address.email}
                  accessibilityRole="button"
                  accessibilityLabel={address.name ? `${address.name}, ${address.email}` : address.email}
                  accessibilityState={{ selected: isSelected }}
                  accessibilityActions={[{ name: 'activate' }, { name: 'delete', label: t('compose.removeRecipient', { name: shownName(address) }) }]}
                  onAccessibilityAction={({ nativeEvent }: AccessibilityActionEvent) =>
                    nativeEvent.actionName === 'delete' ? remove(address) : toggle(address)
                  }
                  onPress={() => toggle(address)}
                  style={[styles.token, isSelected && { backgroundColor: colors.primary }]}
                >
                  <Typography weight="500" color={isSelected ? 'light' : colors.primary} numberOfLines={1} style={styles.shrink}>
                    {shownName(address)}
                  </Typography>
                </Pressable>
              );
            })
          )}
          <TextInput
            ref={input}
            value={text}
            onChangeText={changeText}
            onSubmitEditing={() => text.trim() && commit(text)}
            onFocus={() => {
              setFocused(true);
              onFocus?.();
            }}
            onBlur={() => {
              setFocused(false);
              setSelectedEmail(null);
              if (text.trim()) commit(text);
            }}
            onKeyPress={keyPress}
            accessibilityLabel={name}
            autoFocus={autoFocus}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            blurOnSubmit={false}
            inputAccessoryViewID={inputAccessoryViewID}
            style={[styles.input, { color: colors.text }, folded && styles.foldedInput]}
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
      {selected ? (
        <SelectedRecipient address={selected} onSwap={(next) => swap(selected, next)} />
      ) : (
        suggestions.map((address) => (
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
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { alignSelf: 'flex-start', paddingTop: 14 },
  tokens: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, paddingVertical: 6 },
  token: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%', paddingHorizontal: 5, paddingVertical: 4, borderRadius: 6 },
  shrink: { flexShrink: 1 },
  fixed: { flexShrink: 0 },
  input: { flexGrow: 1, minWidth: 90, fontSize: 16, paddingVertical: 6 },
  foldedInput: { position: 'absolute', width: 1, minWidth: 0, flexGrow: 0, opacity: 0 },
  summary: { width: '100%', overflow: 'hidden', paddingVertical: 6 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: SUMMARY_GAP },
  measure: { position: 'absolute', left: 0, top: 0, width: 10000, flexDirection: 'row', gap: SUMMARY_GAP, opacity: 0 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionText: { flex: 1, gap: 2 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 46, paddingRight: 4, borderBottomWidth: StyleSheet.hairlineWidth },
});
