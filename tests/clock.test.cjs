const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function runtime({ locale = 'en-GB', time, intl = Intl, saved = {}, legacy = false, measure } = {}) {
  const storage = new Map([[legacy ? 'hearth.home.v1' : 'aerotizen.settings.v1', JSON.stringify(saved)]]);
  const elements = { date: {}, time: {
    parentNode: { classList: { toggle() {} } },
    setAttribute(name, value) { this[name] = value; }
  } };
  if (measure) { elements.time.style = {}; }
  const A = { $: (id) => elements[id] };
  const context = vm.createContext({
    window: { AeroTizen: A, navigator: { languages: [locale], language: locale }, Intl: intl, tizen: time ? { time } : undefined,
      getComputedStyle: measure ? () => ({ fontWeight: '700', fontSize: '36px', fontFamily: 'Arial' }) : undefined },
    document: measure ? { createElement: () => ({ getContext: () => ({ measureText: measure }) }) } : undefined,
    AeroTizen: A,
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  });
  for (const file of ['config.js', 'settings.js', 'clock.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../launcher/js', file), 'utf8'), context);
  }
  A.settings.load();
  return { A, elements, storage };
}

const sample = new Date(2026, 9, 21, 17, 4);

test('new settings follow local UK, US, and German date and time conventions', () => {
  for (const [locale, date, time, format] of [
    ['en-GB', 'Wed 21 Oct', '17:04', '24'], ['en-US', 'Wed, Oct 21', '5:04 PM', '12'], ['de-DE', 'Mi., 21. Okt.', '17:04', '24']
  ]) {
    const { A } = runtime({ locale });
    assert.equal(A.settings.dateFormat, 'short');
    assert.equal(A.settings.timeFormat, format);
    assert.equal(A.clock.formatDate(sample, A.settings.dateFormat), date);
    assert.equal(A.clock.formatTime(sample, A.settings.timeFormat), time);
  }
});

test('numeric dates follow TV changes while the selected time format stays saved', () => {
  let datePattern = 'd/m/y', timePattern = 'h:m:s';
  const { A } = runtime({ locale: 'en-US', time: {
    getDateFormat: (short) => { assert.equal(short, true); return datePattern; },
    getTimeFormat: () => timePattern
  } });
  assert.equal(A.clock.formatDate(sample, 'numeric'), '21/10/2026');
  assert.equal(A.clock.formatDate(sample, 'numeric-short'), '21/10');
  assert.equal(A.settings.timeFormat, '24');
  assert.equal(A.clock.formatTime(sample, A.settings.timeFormat), '17:04');
  datePattern = 'y-m-d'; timePattern = 'h:m:s ap';
  assert.equal(A.clock.formatDate(sample, 'numeric'), '2026-10-21');
  assert.equal(A.clock.formatDate(sample, 'numeric-short'), '10-21');
  assert.equal(A.clock.defaultTimeFormat(), '12');
  A.settings.load();
  assert.equal(A.settings.timeFormat, '24');
  assert.equal(A.clock.formatTime(sample, A.settings.timeFormat), '17:04');
});

test('unavailable or unsupported TV formats fall back to the browser locale', () => {
  for (const time of [
    {},
    { getDateFormat: () => { throw Error('Unavailable'); }, getTimeFormat: () => { throw Error('Unavailable'); } },
    { getDateFormat: () => null, getTimeFormat: () => null },
    { getDateFormat: () => 'unsupported', getTimeFormat: () => 'unsupported' }
  ]) {
    const { A } = runtime({ time });
    assert.equal(A.clock.formatDate(sample, 'numeric'), '21/10/2026');
    assert.equal(A.clock.formatDate(sample, 'numeric-short'), '21/10');
    assert.equal(A.clock.formatTime(sample, A.settings.timeFormat), '17:04');
  }
});

test('manual choices survive current and legacy storage, including hiding the date', () => {
  for (const legacy of [false, true]) {
    const { A, elements, storage } = runtime({ legacy, saved: { dateFormat: 'none', timeFormat: '12' } });
    assert.equal(A.settings.dateFormat, 'none');
    assert.equal(A.settings.timeFormat, '12');
    assert.equal(A.clock.formatTime(sample, '12'), '5:04 pm');
    assert.equal(A.clock.formatDate(sample, 'numeric'), '21/10/2026');
    assert.equal(A.clock.formatDate(sample, 'short'), 'Wed 21 Oct');
    A.clock.tick();
    assert.equal(elements.date.hidden, true);
    assert.equal(elements.time['data-format'], '12');
    A.settings.dateFormat = 'numeric-short'; A.settings.timeFormat = '24'; A.settings.save();
    const saved = JSON.parse(storage.get(A.config.STORAGE_KEY));
    assert.equal(saved.dateFormat, 'numeric-short'); assert.equal(saved.timeFormat, '24');
    A.settings.load(); A.clock.tick();
    assert.equal(A.settings.dateFormat, 'numeric-short'); assert.equal(A.settings.timeFormat, '24');
    assert.equal(elements.date.hidden, false);
    assert.equal(elements.time['data-format'], '24');
  }
});

test('older runtimes without Intl still show a date and time', () => {
  const { A } = runtime({ intl: null });
  assert.equal(A.clock.formatDate(sample, 'short'), 'Wed, 21 Oct');
  assert.equal(A.clock.formatDate(sample, 'numeric'), '21/10/2026');
  assert.equal(A.clock.formatDate(sample, 'numeric-short'), '21/10');
  assert.equal(A.settings.timeFormat, '12');
  assert.equal(A.clock.formatTime(sample, A.settings.timeFormat), '5:04 pm');
});

test('readable date styles use local names, order, and punctuation', () => {
  for (const [locale, compact, short, long] of [
    ['en-GB', '21 Oct', 'Wed 21 Oct', 'Wednesday 21 October'],
    ['en-US', 'Oct 21', 'Wed, Oct 21', 'Wednesday, October 21'],
    ['de-DE', '21. Okt.', 'Mi., 21. Okt.', 'Mittwoch, 21. Oktober'],
    ['fr-FR', '21 oct.', 'mer. 21 oct.', 'mercredi 21 octobre'],
    ['ja-JP', '10月21日', '10月21日(水)', '10月21日水曜日']
  ]) {
    const { A } = runtime({ locale });
    assert.equal(A.clock.formatDate(sample, 'compact'), compact);
    assert.equal(A.clock.formatDate(sample, 'short'), short);
    assert.equal(A.clock.formatDate(sample, 'long'), long);
    assert.equal(A.clock.formatDate(sample, 'iso'), '2026-10-21');
  }
});

test('saved legacy styles map to a selected localised style', () => {
  for (const [saved, style, date] of [
    ['auto', 'short', 'Wed 21 Oct'], ['weekday', 'short', 'Wed 21 Oct'],
    ['dmy', 'numeric', '21/10/2026'], ['mdy', 'numeric', '21/10/2026']
  ]) {
    const { A } = runtime({ saved: {dateFormat: saved} });
    assert.equal(A.clock.dateStyle(A.settings.dateFormat), style);
    assert.equal(A.clock.formatDate(sample, A.settings.dateFormat), date);
    assert.ok(A.clock.DATE_FORMATS.some(format => format.id === style));
  }
});

test('readable fallback dates keep the TV month-first order without Intl', () => {
  const { A } = runtime({ intl: null, time: { getDateFormat: () => 'm/d/y' } });
  assert.equal(A.clock.formatDate(sample, 'compact'), 'Oct 21');
  assert.equal(A.clock.formatDate(sample, 'short'), 'Wed, Oct 21');
  assert.equal(A.clock.formatDate(sample, 'long'), 'Wednesday, October 21');
});

test('short numeric dates omit the year and keep local order and separators', () => {
  for (const [locale, date] of [
    ['en-GB', '21/10'], ['en-US', '10/21'], ['de-DE', '21.10.'], ['fr-FR', '21/10'], ['ja-JP', '10/21']
  ]) {
    const { A } = runtime({ locale });
    assert.equal(A.clock.formatDate(sample, 'numeric-short'), date);
  }
  for (const [pattern, date] of [
    ['d/m/y', '21/10'], ['m/d/y', '10/21'], ['y-m-d', '10-21'],
    ['y-d-m', '21-10'], ['dd.mm.yyyy', '21.10'], ['d-y-m', '21-10']
  ]) {
    const { A } = runtime({ intl: null, time: { getDateFormat: () => pattern } });
    assert.equal(A.clock.formatDate(sample, 'numeric-short'), date);
  }
});

test('TV numeric patterns preserve local digits and calendar dates', () => {
  for (const [locale, full, short] of [
    ['ar-EG', '٢١/١٠/٢٠٢٦', '٢١/١٠'],
    ['fa-IR', '۱۴۰۵/۰۷/۲۹', '۰۷/۲۹'],
    ['th-TH', '21/10/2569', '21/10']
  ]) {
    const { A } = runtime({ locale, time: { getDateFormat: () => 'd/m/y' } });
    assert.equal(A.clock.formatDate(sample, 'numeric'), full);
    assert.equal(A.clock.formatDate(sample, 'numeric-short'), short);
  }
});

test('older Intl implementations without formatToParts keep dates localised', () => {
  const intl = { DateTimeFormat: function (locales, options) {
    const formatter = new Intl.DateTimeFormat(locales, options);
    return { format: formatter.format };
  } };
  const { A } = runtime({ locale: 'fa-IR', intl, time: { getDateFormat: () => 'd/m/y' } });
  assert.equal(A.clock.formatDate(sample, 'numeric'), '۱۴۰۵/۰۷/۲۹');
  assert.equal(A.clock.formatDate(sample, 'numeric-short'), '۰۷/۲۹');
});

test('TV patterns do not strip required calendar eras', () => {
  const japanese = runtime({ locale: 'ja-JP-u-ca-japanese', time: {getDateFormat: () => 'd/m/y'} });
  assert.equal(japanese.A.clock.formatDate(sample, 'numeric'), 'R8/10/21');
  const islamic = runtime({ locale: 'ar-SA-u-ca-islamic-umalqura', time: {getDateFormat: () => 'd/m/y'} });
  assert.match(islamic.A.clock.formatDate(sample, 'numeric'), /١٤٤٨.*هـ$/);
});

test('initial time selection uses the device setting before the browser locale', () => {
  for (const [locale, pattern, expected] of [['en-US', 'h:m:s', '24'], ['en-GB', 'h:m:s ap', '12']]) {
    const { A, storage } = runtime({ locale, time: {getTimeFormat: () => pattern} });
    assert.equal(A.settings.timeFormat, expected);
    assert.equal(JSON.parse(storage.get(A.config.STORAGE_KEY)).timeFormat, expected);
  }
});

test('legacy Automatic and invalid settings resolve once, including legacy storage', () => {
  for (const legacy of [false, true]) {
    for (const previous of ['auto', null, 'invalid']) {
      const { A, storage } = runtime({ locale: 'en-GB', legacy, saved: {timeFormat: previous} });
      assert.equal(A.settings.timeFormat, '24');
      assert.equal(JSON.parse(storage.get(A.config.STORAGE_KEY)).timeFormat, '24');
    }
  }
});

test('saved manual time choices override the device default', () => {
  for (const [saved, pattern] of [['12', 'h:m:s'], ['24', 'h:m:s ap']]) {
    const { A } = runtime({ saved: {timeFormat: saved}, time: {getTimeFormat: () => pattern} });
    assert.equal(A.settings.timeFormat, saved);
    A.settings.load();
    assert.equal(A.settings.timeFormat, saved);
  }
});

test('both time choices keep local digits and day periods', () => {
  const arabic = runtime({ locale: 'ar-EG' });
  assert.equal(arabic.A.settings.timeFormat, '12');
  assert.equal(arabic.A.clock.formatTime(sample, '12'), '٥:٠٤ م');
  assert.equal(arabic.A.clock.formatTime(sample, '24'), '١٧:٠٤');
  const persian = runtime({ locale: 'fa-IR' });
  assert.equal(persian.A.settings.timeFormat, '24');
  assert.equal(persian.A.clock.formatTime(sample, '24'), '۱۷:۰۴');
});

test('time choices handle midnight and noon explicitly', () => {
  const { A } = runtime({ locale: 'en-US' });
  const midnight = new Date(2026,9,21,0,4), noon = new Date(2026,9,21,12,4);
  assert.equal(A.clock.formatTime(midnight, '12'), '12:04 AM');
  assert.equal(A.clock.formatTime(midnight, '24'), '00:04');
  assert.equal(A.clock.formatTime(noon, '12'), '12:04 PM');
  assert.equal(A.clock.formatTime(noon, '24'), '12:04');
});

test('device detection still works without Intl', () => {
  const { A } = runtime({ intl: null, time: {getTimeFormat: () => 'h:m:s'} });
  assert.equal(A.settings.timeFormat, '24');
  assert.equal(A.clock.formatTime(sample, A.settings.timeFormat), '17:04');
});


test('clock output follows a changed system time zone without reloading', () => {
  let timeZone = 'Europe/London';
  const intl = { DateTimeFormat: function (locale, options) {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } };
  const { A } = runtime({ intl });
  const instant = new Date('2026-01-01T13:00:00Z');
  assert.equal(A.clock.formatTime(instant, '24'), '13:00');
  timeZone = 'Asia/Tokyo';
  assert.equal(A.clock.formatTime(instant, '24'), '22:00');
});

test('older Intl keeps a stable fitting clock without repeated layout measurement', () => {
  let constructors = 0, measurements = 0;
  const intl = { DateTimeFormat: function () {
    constructors++;
    return { resolvedOptions: () => ({ hour12: false }), format: () => 'date' };
  } };
  const { A, elements } = runtime({ intl, measure: text => {
    measurements++;
    return { width: text.length * 10 };
  } });
  const initialConstructors = constructors;
  A.clock.tick();
  assert.ok(constructors - initialConstructors < 8, 'unsupported hourCycle must not create a formatter for each minute');
  assert.ok(parseFloat(elements.time.style.width) >= elements.time.textContent.length * 10);
  const width = elements.time.style.width, measured = measurements;
  A.clock.tick();
  assert.equal(elements.time.style.width, width);
  assert.equal(measurements, measured, 'normal clock updates reuse the reserved width');
});
