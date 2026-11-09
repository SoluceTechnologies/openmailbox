import { Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import { Button, FormField, FormSection, ListRow, ScreenHeader, SegmentedControl } from '@/ui/components';

import { renderWithProviders } from '../helpers/render';

describe('form components', () => {
  it('captions a section in capitals and separates its rows', () => {
    renderWithProviders(
      <FormSection title="Incoming mail" footer="Shown under the rows">
        <Text>First</Text>
        {null}
        <Text>Second</Text>
      </FormSection>,
    );
    expect(screen.getByText('INCOMING MAIL')).toBeOnTheScreen();
    expect(screen.getByText('Shown under the rows')).toBeOnTheScreen();
    expect(screen.getByText('First')).toBeOnTheScreen();
    expect(screen.getByText('Second')).toBeOnTheScreen();
  });

  it('labels a field with its title for screen readers', () => {
    const onChangeText = jest.fn();
    renderWithProviders(<FormField label="Server" value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText('Server'), 'imap.example.com');
    expect(onChangeText).toHaveBeenCalledWith('imap.example.com');
  });

  it('only shows a chevron on rows that lead somewhere', () => {
    const onPress = jest.fn();
    renderWithProviders(
      <>
        <ListRow title="About" onPress={onPress} />
        <ListRow title="Version" detail="1.0.0" />
      </>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'About' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Version' })).toBeNull();
    expect(screen.getByText('1.0.0')).toBeOnTheScreen();
  });

  it('hides a zero detail', () => {
    renderWithProviders(<ListRow title="Trash" detail={0} />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('selects one segment at a time', () => {
    const onChange = jest.fn();
    renderWithProviders(
      <SegmentedControl
        accessibilityLabel="Filter"
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: 'All' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Unread' })).not.toBeSelected();
    fireEvent.press(screen.getByRole('tab', { name: 'Unread' }));
    expect(onChange).toHaveBeenCalledWith('unread');
  });

  it('ignores presses on a disabled button', () => {
    const onPress = jest.fn();
    renderWithProviders(<Button title="Sign In" disabled onPress={onPress} />);
    fireEvent.press(screen.getByText('Sign In'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('presents buttons as buttons to screen readers, with their state', () => {
    renderWithProviders(<Button title="Sign In" disabled onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDisabled();
  });

  it('names the back button for screen readers', () => {
    const onBack = jest.fn();
    renderWithProviders(<ScreenHeader title="Settings" onBack={onBack} />);
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
