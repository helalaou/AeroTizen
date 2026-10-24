const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../launcher/js/i18n.js'), 'utf8');

function harness(browserLanguage = 'en-GB', tizen = true) {
  const spans = ['All apps', 'Settings', 'Date & time'].map(key => ({
    key, textContent: '',
    getAttribute: () => key
  }));
  const doc = {
    documentElement: { lang: 'en' },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-i18n]');
      return spans;
    }
  };
  let respondLocale, calls = 0, requested = 0;
  const A = {
    tizen: tizen ? {
      systeminfo: {
        getPropertyValue(property, success) {
          assert.equal(property, 'LOCALE');
          requested++;
          respondLocale = success;
        }
      }
    } : null
  };
  const window = {
    AeroTizen: A,
    navigator: { language: browserLanguage, languages: [browserLanguage] }
  };
  vm.runInNewContext(source, { window, document: doc });
  A.i18n.start(() => { calls++; });
  return {
    A, doc, spans,
    sendLocale: language => respondLocale({ language }),
    get calls() { return calls; },
    get requests() { return requested; }
  };
}

test('English is the fallback and unknown languages never mutate app names', () => {
  const h = harness('fr-FR');
  assert.equal(h.A.i18n.code(), 'en');
  assert.equal(h.A.i18n.t('All apps'), 'All apps');
  assert.equal(h.A.i18n.t('Netflix'), 'Netflix');
  assert.equal(h.A.i18n.label('weather:result:0', 'Rome, Lazio, Italy'), 'Rome, Lazio, Italy');
  assert.equal(h.A.i18n.label('name:HDMI 1', 'My PlayStation'), 'My PlayStation');
  assert.equal(h.doc.documentElement.lang, 'en');
});

test('Italian Tizen locale overrides English browser locale and updates static labels', () => {
  const h = harness('en-GB');
  assert.equal(h.requests, 1);
  h.sendLocale('ita_IT');
  assert.equal(h.A.i18n.code(), 'it');
  assert.equal(h.A.i18n.locale(), 'it-IT');
  assert.equal(h.doc.documentElement.lang, 'it');
  assert.deepEqual(h.spans.map(x => x.textContent), ['Tutte le app', 'Impostazioni', 'Data e ora']);
  assert.equal(h.A.i18n.t('Live TV'), 'TV in diretta');
  assert.equal(h.A.i18n.label('time:none', 'No time'), 'Nascondi ora');
  assert.equal(h.A.i18n.label('date:none', 'No date'), 'Nascondi data');
  assert.equal(h.A.i18n.label('time:12', '4:30 PM  (12-hour)'), '4:30 PM  (12 ore)');
  assert.equal(h.calls, 1);
  h.sendLocale('ita_IT');
  assert.equal(h.calls, 1, 'repeated locale replies do not rebuild the UI');
});

test('an unsupported Tizen locale falls back to English even on an Italian browser', () => {
  const h = harness('it-IT');
  assert.equal(h.A.i18n.t('Settings'), 'Impostazioni');
  h.sendLocale('de_DE');
  assert.equal(h.A.i18n.code(), 'en');
  assert.equal(h.A.i18n.t('Settings'), 'Settings');
  assert.equal(h.doc.documentElement.lang, 'en');
});

test('unsupported LOCALE APIs keep navigator.language and never require a network call', () => {
  const h = harness('it-IT', false);
  assert.equal(h.requests, 0);
  assert.equal(h.A.i18n.locale(), 'it-IT');
  assert.equal(h.A.i18n.label('weather:result:1', 'Milano'), 'Milano');
  assert.equal(h.A.i18n.displayMessage('Could not open Netflix'), 'Impossibile aprire Netflix');
});

test('returning to the foreground can refresh the system locale', () => {
  const h = harness('en-US');
  assert.equal(h.A.i18n.locale(), 'en-US');
  h.sendLocale('ita_IT');
  assert.equal(h.A.i18n.code(), 'it');
  h.A.i18n.refresh();
  assert.equal(h.requests, 2);
  h.sendLocale('eng_GBR');
  assert.equal(h.A.i18n.code(), 'en');
});

test('the previously tested app menu and clock choices remain translatable', () => {
  const h = harness('it-IT', false);
  assert.equal(h.A.i18n.t('Move'), 'Sposta');
  assert.equal(h.A.i18n.t('Add to Home'), 'Aggiungi alla Home');
  assert.equal(h.A.i18n.t('Remove from Home'), 'Rimuovi dalla Home');
  assert.equal(h.A.i18n.t('Classic AeroTizen'), 'Classica AeroTizen');
  assert.equal(h.A.i18n.t('Clock style'), 'Stile orologio');
  assert.equal(h.A.i18n.t('Large vertical'), 'Verticale grande');
  assert.equal(h.A.i18n.t('Horizontal'), 'Orizzontale');
  assert.equal(h.A.i18n.t('Thin'), 'Sottile');
  assert.equal(h.A.i18n.t('Bold'), 'Grassetto');
});

test('V992.56 artwork and photo-weather options localise without changing user data', () => {
  const it = harness('it-IT', false);
  const translations = {
    'Weather wallpaper': 'Sfondo meteo',
    'Off': 'Disattivato',
    'Automatic (weather)': 'Automatico (meteo)',
    'Home tile layout': 'Layout tessere Home',
    'Apps per row': 'App per riga',
    'App card shape': 'Forma delle tessere',
    'Square': 'Quadrato',
    'Rectangle': 'Rettangolo',
    'Default': 'Predefinito',
    '3 per row': '3 per riga',
    '4 per row': '4 per riga',
    '5 per row': '5 per riga'
  };
  for (const [english, italian] of Object.entries(translations)) {
    assert.equal(it.A.i18n.t(english), italian, english);
    assert.equal(it.A.i18n.label('card:option:' + english, english), italian);
  }
  assert.equal(it.A.i18n.label('name:HDMI 1', 'My Xbox'), 'My Xbox');
  assert.equal(it.A.i18n.label('weather:result:0', 'Alghero, Sardinia'), 'Alghero, Sardinia');
  const en = harness('en-GB', false);
  for (const english of Object.keys(translations)) {
    assert.equal(en.A.i18n.t(english), english);
  }
});
