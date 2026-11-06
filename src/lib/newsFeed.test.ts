import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJson, parseDamLevel, parseFeedItems, parseHistoryBorn, parseQuakes, slugFromUrl } from './newsFeed.ts';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Inquirer Full Feed</title>
<item>
  <title>Traffic &amp; floods worsen</title>
  <link>https://newsinfo.inquirer.net/2336533/speaker-dy-backs-calls?utm=feed</link>
  <pubDate>Thu, 05 Nov 2026 12:27:22 +0800</pubDate>
  <description><![CDATA[<p>Manila traffic.</p>]]></description>
</item>
<item>
  <title>Second story</title>
  <link>https://globalnation.inquirer.net/345887/trumps-midterm-defeat</link>
  <pubDate>Wed, 04 Nov 2026 08:00:00 +0800</pubDate>
  <description>plain text</description>
</item>
</channel></rss>`;

test('parseFeedItems reads titles, links, dates and descriptions', () => {
  const items = parseFeedItems(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Traffic & floods worsen');
  assert.equal(items[0].link, 'https://newsinfo.inquirer.net/2336533/speaker-dy-backs-calls?utm=feed');
  assert.equal(items[0].description, '<p>Manila traffic.</p>');
  assert.equal(items[1].pubDate, 'Wed, 04 Nov 2026 08:00:00 +0800');
  assert.equal(items[1].description, 'plain text');
});

test('parseFeedItems ignores non-item markup', () => {
  assert.deepEqual(parseFeedItems('<rss><channel><title>chan</title></channel></rss>'), []);
});

test('slugFromUrl takes the last path segment, query stripped', () => {
  assert.equal(
    slugFromUrl('https://newsinfo.inquirer.net/2336533/speaker-dy-backs-calls?x=1'),
    'speaker-dy-backs-calls',
  );
});

test('extractJson handles fenced, prose-wrapped and plain replies', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":1} — hope that helps'), { a: 1 });
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.throws(() => extractJson('no json here'));
});

const PAGASA_ROW = `<h5 class="pull-right">November 05,2026 08:00:00 am</h5>
<table class="table dam-table"><tbody><tr>
<td data-id="Angat" class="td-Angat current-dam" rowspan="4">Angat</td>
<td data-id="Angat" class="td-Angat current-data" >08:00 AM</td>
<td data-id="Angat" class="td-Angat current-data" rowspan="2">208.79</td>
<td data-id="Angat" class="td-Angat" rowspan="4">24</td>
<td data-id="Angat" class="td-Angat" rowspan="4">0.02</td>
<td data-id="Angat" class="td-Angat current-data" rowspan="4">210.00</td>
<td data-id="Angat" class="td-Angat current-data" rowspan="2">-1.21</td>
<td data-id="Angat" class="td-Angat current-data" rowspan="2">198.70</td>
<td data-id="Angat" class="td-Angat current-data" rowspan="2">10.09</td>
<td data-id="Angat" class="td-Angat current-data" rowspan="2"></td>
</tr>
<tr><td data-id="Angat" class="td-Angat current-data">Nov-05</td></tr>
</tbody></table>`;

test('parseDamLevel pulls RWL, NHWL and rule curve from the Angat row', () => {
  assert.deepEqual(parseDamLevel(PAGASA_ROW), {
    level: 208.79,
    nhwl: 210.0,
    ruleCurve: 198.7,
    observedAt: 'November 05,2026 08:00:00 am',
  });
});

test('parseDamLevel returns null without an Angat row', () => {
  assert.equal(parseDamLevel('<table><tr><td>other dam</td></tr></table>'), null);
});

const KAHIMYANG_ENTRY = [
  {
    news_title: 'Enrique Magalona, Defender of Labor Rights, born in Saravia, Negros Occidental on November 5, 1891\n',
    news_first:
      '<p>\r\n<time datetime="1891-11-05"><span class="new-span">Enrique "Equi" Barrera Magalona Sr.</span>, born on November 5, 1891</time>, in Saravia, Negros Occidental, ranks among the most eminent Filipino lawmakers.\r\n</p>',
    news_url: '/articles/3264/legacy-of-enrique-magalona-lawmaker-worker-champion',
  },
];

test('parseHistoryBorn strips HTML and takes the first entry', () => {
  assert.deepEqual(parseHistoryBorn(KAHIMYANG_ENTRY), {
    title: 'Enrique Magalona, Defender of Labor Rights, born in Saravia, Negros Occidental on November 5, 1891',
    body: 'Enrique "Equi" Barrera Magalona Sr., born on November 5, 1891, in Saravia, Negros Occidental, ranks among the most eminent Filipino lawmakers.',
    url: 'https://kahimyang.com/articles/3264/legacy-of-enrique-magalona-lawmaker-worker-champion',
  });
});

test('parseHistoryBorn returns null on empty or malformed payloads', () => {
  assert.equal(parseHistoryBorn([]), null);
  assert.equal(parseHistoryBorn(null), null);
  assert.equal(parseHistoryBorn([{ news_title: 'x' }]), null);
});

const PHIVOLCS_HTML = `
<table>
<tr><th>Date - Time (Philippine Time)</th><th>Latitude</th><th>Longitude</th><th>Depth (km)</th><th>Mag</th><th>Location</th></tr>
<tr><td colspan="6"><strong>November 2026</strong></td></tr>
<tr>
  <td><span class="auto-style70"><a href="2026_Earthquake_Information\\November\\2026_1105_062025_B1.html">
    05 November 2026 - 02:20 PM</a></span></td>
  <td align="center">05.29</td>
  <td align="center">125.36</td>
  <td align="center">010</td>
  <td align="center"><strong>4.4</strong></td>
  <td>015<span>km S 26° W of Balut Island (Municipality Of Sarangani) (Davao Occidental)</span></td>
</tr>
<tr>
  <td><a href="2026_Earthquake_Information\\October\\2026_1031_212435_B3F.html">01 November 2026 - 05:24 AM</a></td>
  <td align="center">16.12</td><td align="center">120.45</td><td align="center">027</td>
  <td align="center"><strong>3.1</strong></td>
  <td>009 km NW of Iba, Zambales</td>
</tr>
</table>`;

test('parseQuakes reads PHIVOLCS bulletin rows and normalises bulletin URLs', () => {
  const quakes = parseQuakes(PHIVOLCS_HTML);
  assert.equal(quakes.length, 2);
  assert.deepEqual(quakes[0], {
    time: '05 November 2026 - 02:20 PM',
    lat: '05.29',
    lon: '125.36',
    depth: '010',
    mag: '4.4',
    location: '015 km S 26° W of Balut Island (Municipality Of Sarangani) (Davao Occidental)',
    url: 'https://earthquake.phivolcs.dost.gov.ph/2026_Earthquake_Information/November/2026_1105_062025_B1.html',
  });
  assert.equal(quakes[1].mag, '3.1');
});

test('parseQuakes skips header and month-group rows', () => {
  assert.deepEqual(parseQuakes('<table><tr><th>Mag</th></tr></table>'), []);
  assert.deepEqual(parseQuakes(''), []);
});
