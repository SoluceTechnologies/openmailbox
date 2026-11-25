import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Security, type ServerEndpoint } from '@openmailbox/mail-core';

import { FormField, FormSection, SegmentedControl, Typography } from '@/ui/components';

export function EndpointSection({
  title,
  hostPlaceholder,
  endpoint,
  onChange,
  children,
  footer,
}: {
  title: string;
  hostPlaceholder: string;
  endpoint: ServerEndpoint;
  onChange: (endpoint: ServerEndpoint) => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <FormSection title={title} footer={footer}>
      <FormField
        label={t('accounts.setup.host')}
        value={endpoint.host}
        onChangeText={(host) => onChange({ ...endpoint, host: host.trim() })}
        placeholder={hostPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <FormField
        label={t('accounts.setup.port')}
        value={endpoint.port ? String(endpoint.port) : ''}
        onChangeText={(port) => onChange({ ...endpoint, port: Number(port.replace(/\D/g, '')) || 0 })}
        keyboardType="number-pad"
      />
      <View style={styles.segmentRow}>
        <Typography variant="body1" weight="400" style={styles.segmentLabel}>
          {t('accounts.setup.security')}
        </Typography>
        <View style={styles.flex}>
          <SegmentedControl
            accessibilityLabel={t('accounts.setup.security')}
            value={endpoint.security}
            onChange={(security) => onChange({ ...endpoint, security })}
            options={[
              { value: Security.Tls, label: 'SSL/TLS' },
              { value: Security.StartTls, label: 'STARTTLS' },
            ]}
          />
        </View>
      </View>
      {children}
    </FormSection>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, gap: 8 },
  segmentLabel: { width: 116, fontSize: 16 },
});
