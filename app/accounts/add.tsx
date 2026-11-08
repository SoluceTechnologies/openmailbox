import { useRouter } from 'expo-router';

import { AccountSetupFlow } from '@/features/accounts/components/AccountSetupFlow';

export default function AddAccountScreen() {
  const router = useRouter();
  return <AccountSetupFlow onDone={() => router.back()} onClose={() => router.back()} />;
}
