import { useTranslation } from 'react-i18next';

import { FormSection, ListRow } from '@/ui/components';

import { OVH_OFFERS, type OvhOffer } from '../providers';

export function OvhOfferPicker({ onSelect }: { onSelect: (offer: OvhOffer) => void }) {
  const { t } = useTranslation();
  return (
    <FormSection footer={t('accounts.setup.ovhOfferHint')}>
      {OVH_OFFERS.map((offer) => (
        <ListRow key={offer.identifier} title={offer.name} onPress={() => onSelect(offer)} />
      ))}
    </FormSection>
  );
}
