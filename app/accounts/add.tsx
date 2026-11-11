import { AccountSetupFlow } from '@/features/accounts/components/AccountSetupFlow';
import { goBack } from '@/utils/navigation';

export default function AddAccountScreen() {
  return <AccountSetupFlow onDone={goBack} onClose={goBack} />;
}
