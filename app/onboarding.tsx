import { useRouter } from 'expo-router';

import { AccountSetupFlow } from '@/features/accounts/components/AccountSetupFlow';

export default function OnboardingScreen() {
  const router = useRouter();
  return <AccountSetupFlow onDone={() => router.replace('/')} />;
}
