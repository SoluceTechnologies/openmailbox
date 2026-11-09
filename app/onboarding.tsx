import { useRouter } from 'expo-router';

import { AccountSetupFlow } from '@/features/accounts/components/AccountSetupFlow';
import { requestNotificationPermission } from '@/services/notifications';

export default function OnboardingScreen() {
  const router = useRouter();
  return (
    <AccountSetupFlow
      onDone={() => {
        requestNotificationPermission()
          .catch(() => false)
          .finally(() => router.replace('/'));
      }}
    />
  );
}
