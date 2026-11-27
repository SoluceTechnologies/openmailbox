import { documentFor, PAGE } from '@/features/reader/readerPage';

describe('reader page', () => {
  it('keeps the page as tall as the mail when the mail stretches html and body to the screen', () => {
    const page = documentFor('<style>html,body{height:100% !important}</style><p>Hi</p>', false, PAGE.light);
    expect(page).toContain(':root, :root > body { height: auto !important; min-height: 0 !important; max-height: none !important; }');
    expect(page.indexOf(':root, :root > body')).toBeLessThan(page.indexOf('<style>html,body'));
  });
});
