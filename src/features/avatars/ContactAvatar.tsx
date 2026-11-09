import { memo } from 'react';

import { avatarColor } from '@/theme';
import { Avatar } from '@/ui/components';

import { useAvatar } from './useAvatar';

interface ContactAvatarProps {
  email?: string;
  name: string;
  size?: number;
}

/** A correspondent's Gravatar or company logo, or their initials. */
export const ContactAvatar = memo(function ContactAvatar({ email, name, size }: ContactAvatarProps) {
  const uri = useAvatar(email);
  return <Avatar uri={uri} name={name} size={size} color={avatarColor(email ?? name)} />;
});
