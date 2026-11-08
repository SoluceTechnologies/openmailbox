import { MailCore, type MailCoreLike } from '@openmailbox/mail-core';
import { Paths } from 'expo-file-system';

let instance: MailCoreLike | null = null;

function directoryPath(uri: string, name: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/?$/, `/${name}`);
}

export function mailCore(): MailCoreLike {
  instance ??= MailCore.open(directoryPath(Paths.document.uri, 'mail'));
  return instance;
}

export function attachmentsDirectory(): string {
  return directoryPath(Paths.cache.uri, 'attachments');
}
