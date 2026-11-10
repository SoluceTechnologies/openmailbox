import { pageColors } from '@/features/reader/components/HtmlBody';

describe('pageColors', () => {
  it('follows the dark theme for mail without colors of its own', () => {
    expect(pageColors('<p>Bonjour</p>', true).background).toBe('#1c1c1e');
  });

  it('keeps mail that sets its colors on white, whatever the theme', () => {
    expect(pageColors('<p style="color: #333">Bonjour</p>', true).background).toBe('#ffffff');
    expect(pageColors('<table bgcolor="#fff"><tr><td>x</td></tr></table>', true).background).toBe('#ffffff');
    expect(pageColors('<font color="red">x</font>', true).background).toBe('#ffffff');
  });

  it('is white in the light theme', () => {
    expect(pageColors('<p>Bonjour</p>', false).background).toBe('#ffffff');
  });
});
