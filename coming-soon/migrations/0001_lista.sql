-- Lista čekanja za Planiraj (coming soon)
CREATE TABLE IF NOT EXISTS prijave (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  uloga TEXT NOT NULL CHECK (uloga IN ('par', 'ponudjac')),
  kategorija TEXT,
  grad TEXT,
  kod TEXT NOT NULL UNIQUE,        -- lični kod za link preporuke (?ref=KOD)
  ref TEXT,                        -- kod osobe koja je poslala link
  vrijeme TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS prijave_ref ON prijave (ref);

-- ograničenje broja pokušaja po IP adresi (čuva se samo hash adrese)
CREATE TABLE IF NOT EXISTS pokusaji (
  ip TEXT NOT NULL,
  vrijeme INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pokusaji_ip ON pokusaji (ip, vrijeme);
