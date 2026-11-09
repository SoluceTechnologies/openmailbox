import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { openAttachment } from '@/features/attachments/openAttachment';
import { MessageBody } from '@/features/reader/components/MessageBody';
import i18n from '@/utils/i18n';

import { core } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

jest.mock('@/features/attachments/openAttachment', () => ({ openAttachment: jest.fn(async () => undefined) }));

const PDF = { index: 0, filename: 'Facture.pdf', mimeType: 'application/pdf', size: 245_760 };

describe('MessageBody attachments', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  beforeEach(() => {
    jest.clearAllMocks();
    core.body.mockResolvedValue({ text: 'Ci-joint la facture.', hasRemoteContent: false, attachments: [PDF] });
  });

  it('lists attachments with their size and opens them in place', async () => {
    renderWithProviders(<MessageBody emailId="email-1" />);
    const chip = await screen.findByRole('button', { name: 'Open Facture.pdf' });
    expect(screen.getByText('240 KB')).toBeOnTheScreen();

    await act(async () => fireEvent.press(chip));

    expect(openAttachment).toHaveBeenCalledWith('email-1', PDF);
  });

  it('says when an attachment cannot be opened', async () => {
    (openAttachment as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<MessageBody emailId="email-1" />);

    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Open Facture.pdf' })));

    expect(alert).toHaveBeenCalledWith(i18n.t('reader.attachmentFailed'));
  });
});
