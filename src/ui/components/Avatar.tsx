import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { File } from 'expo-file-system';
import { useTheme } from 'expo-router';
import Typography from './Typography';

const svgs = new Map<string, string | null>();

/** A saved SVG picture (a brand's BIMI logo), read once. */
function svgAt(uri: string): string | null {
  if (!svgs.has(uri)) {
    try {
      svgs.set(uri, new File(uri).textSync());
    } catch {
      svgs.set(uri, null);
    }
  }
  return svgs.get(uri) ?? null;
}

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  color?: string;
}

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function Avatar({ uri, name, size = 40, color }: AvatarProps) {
  const { colors } = useTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const radius = size / 2;

  const svg = uri && uri !== failedUri && uri.endsWith('.svg') ? svgAt(uri) : null;
  if (svg) {
    return (
      <View
        testID="avatar-picture"
        style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: '#ffffff', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
      >
        <SvgXml xml={svg} width={size} height={size} onError={() => setFailedUri(uri ?? null)} />
      </View>
    );
  }

  if (uri && uri !== failedUri && !uri.endsWith('.svg')) {
    return (
      <Image
        testID="avatar-picture"
        source={{ uri }}
        onError={() => setFailedUri(uri)}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#ffffff', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: color ?? colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography variant="body2" color="light" style={{ fontSize: size * 0.4, lineHeight: size }}>
        {initials(name)}
      </Typography>
    </View>
  );
}

export default React.memo(Avatar);
