// Node 25+ ima vlastiti globalni localStorage/sessionStorage koji bez --localstorage-file vraća undefined i zaklanja
// jsdom-ov, pa testovi koji koriste preglednikovo spremište padaju. Ovdje se vraća jsdom-ovo spremište.
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
if (dom) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    if (typeof globalThis[key] === 'undefined')
      Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
}
