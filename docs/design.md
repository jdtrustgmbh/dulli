# Design

Brand, design system and UI specification of Dulli (German originals).

## Dulli Designguide

Dieser Guide ist die verbindliche Referenz für das Erscheinungsbild von Dulli (Familienplaner). Neue Seiten, Komponenten und Marketing-Material orientieren sich daran, damit alles aus einem Guss wirkt. Die Originaldateien des Branding-Sets liegen unverändert in `branding/`, die ausgelieferten Web-Dateien in `public/assets/brand/`.

Claim: **Gemeinsam durchs Familienchaos.**

### 1. Marke

Dulli ist ein warmes, ruhiges Familien-Werkzeug. Das Zeichen zeigt ein türkises Haus mit drei Personen (zwei Erwachsene, ein Kind), einem Herz am Schornstein und einem grünen, buchförmigen Sockel. Die Wortmarke „Dulli“ ist eine gerundete Vektorschrift (Basis: Comfortaa Bold) und liegt als Grafik vor. Sie wird nie als Text nachgesetzt.

Tonalität: freundlich, klar, kurz. Du-Ansprache in Anmeldung und Einstellungen, „ihr“ für die Familie. Keine Fachbegriffe, keine Ausrufezeichen-Ketten.

### 2. Farben

| Name | Hex | Token | Einsatz |
| --- | --- | --- | --- |
| Dunkelblau | `#042F57` | `--ink`, `--brand-navy` | Text, Überschriften, Wortmarke |
| Türkis | `#00A6A9` | `--brand-teal` | Logo, Illustrationen, große Flächen, Icons ohne Text |
| Türkis (Aktion) | `#067F83` | `--teal` | Buttons, Links, Schalter, Fokus, Text in Türkis |
| Türkis dunkel | `#046468` | `--teal-strong` | Hover/aktiv |
| Türkis hell | `#E2F6F6` | `--teal-tint` | Hintergründe aktiver Elemente, Chips |
| Koralle | `#FE4758` | `--brand-coral` | Herz, Familienmitglied, Akzentflächen |
| Koralle (Text/Warnung) | `#D9444F` | `--coral` | Fehler, Warnungen, Texte in Koralle |
| Sonnengelb | `#FFBC00` | `--amber`, `--brand-sun` | Kind, Hervorhebungen, Münzen/Belohnungen |
| Frühlingsgrün | `#63C742` | `--green`, `--brand-green` | Erledigt, Zusammenhalt |
| Cremeweiß | `#FCFAF6` | `--bg`, `--brand-cream` | Seitenhintergrund |
| Weiß | `#FFFFFF` | `--paper` | Karten, Formulare, Topbar |

Regeln:

- Weißer Text steht nur auf `--teal` (`#067F83`, Kontrast 4,8:1), `--ink` oder `--coral` (`#D9444F`). Auf dem hellen Logo-Türkis `#00A6A9` und auf Sonnengelb steht dunkler Text (`--ink`).
- Das helle Logo-Türkis ist Markenfarbe für Flächen und Grafiken, nicht für kleine Texte.
- Farbe trägt nie allein eine Information. Erledigt, Fehler und Warnung brauchen zusätzlich Icon oder Text.
- Familienmitglieder bekommen der Reihe nach Türkis, Koralle, Sonnengelb, Grün, Dunkelblau (`window.__jdMemberPalette` in `app.js`). Weitere Mitglieder nutzen die Zusatzfarben der Palette.
- Pastellflächen (`--p-*`, `--d-*` in `public/css/theme.css`) sind Ableitungen der Markenfarben für Kalender, Mahlzeiten und Spalten. Neue Pastelltöne werden aus einer Markenfarbe abgeleitet, nicht frei gewählt.

### 3. Logos

Das optimierte Web-Brandkit (Korrigiert 2026-11-03) zeigt das türkise Haus mit Familie, Herz und durchgehendem grünen Bogen. Die Wortmarke „Dulli“ ist eine kindliche, dunkelblaue Schrift. Archiv: `branding/09_brandkit_2026-11-03/`.

| Datei (`public/assets/brand/`) | Einsatz |
| --- | --- |
| `dulli-logo-horizontal-light.svg` / `-1200.png` | App-Kopfzeile, Marketing-Navigation, Anzeigemodus, rechtliche Seiten |
| `dulli-logo-horizontal-dark.svg` / `-1200.png` | Dieselben Orte auf dunklem Grund (Wortmarke weiß) |
| `dulli-logo-stacked-light.svg` / `-1200.png` | Anmelden, Einladung annehmen, Startflächen |
| `dulli-logo-stacked-dark.svg`, `-dark-transparent.svg` | Gestapelt auf dunklem Grund |
| `dulli-logo-symbol.svg` | Bildmarke ohne Wort (auf dem Smartphone in der Kopfzeile) |
| `dulli-icon-navy.svg`, `dulli-icon-white.svg` | Einfarbige Anwendungen |

Quellen und Vektor-Master liegen unverändert in `branding/kit/00_master/`. Hinweis aus der Lieferung: Die Vektoren sind automatisch aus der Vorlage erzeugt, `dulli-pixelidentisch-raster-in-svg.svg` ist pixelgleich, aber ein Rasterbild in einer SVG-Hülle.

Regeln:

- Freiraum rundherum mindestens so breit wie der Buchstabe „D“. Nichts darüber legen.
- Mindesthöhe horizontales Logo: 32 px, stacked: 96 px. Darunter das App-Icon verwenden.
- Nicht verzerren, nicht drehen, nicht umfärben, keine zusätzlichen Schatten oder Effekte.
- Auf Weiß, Cremeweiß und `--teal-tint` die helle Variante, auf Dunkelblau die dunkle.
- Das Logo im HTML ist ein `<img>` mit `alt=""` innerhalb eines Links mit `aria-label="Dulli"`. So liest ein Screenreader den Namen genau einmal.

### 4. App-Icon, Favicon, Homescreen

Überall dasselbe Icon: Haus mit Familie auf Weiß. Es gibt keine zweite Variante im Produkt, nur den Dunkel-Modus des Icons als Archivdatei.

| Plattform | Dateien (`public/assets/brand/`) | Eingebunden über |
| --- | --- | --- |
| Browser-Tab | `favicon.ico` (16/32/48), `favicon-16.png`, `favicon-32.png`, `favicon-auto.svg` (passt sich dem Farbschema an) | `<link rel="icon">`, zusätzlich `/favicon.ico` |
| iPhone/iPad Homescreen | `apple-touch-icon.png` (180), `-167`, `-152`, `-120`, `-512` | `<link rel="apple-touch-icon" sizes=…>`, `/apple-touch-icon.png` |
| Android/Chrome Installation | `dulli-app-icon-192.png`, `-512.png` (any), `dulli-maskable-192.png`, `-512.png` (maskable) | `manifest.webmanifest` |
| Android nativ (Capacitor) | `android-icon-48…512.png`, `adaptive-icon-foreground-432/512.png`, `adaptive-icon-background-432.png`, `branding/04_android/adaptive_icon.xml` | Capacitor-Projekt |
| Social-Vorschau | `dulli-og-1200x630.png` | `og:image` |

Wichtig für iOS: Das mitgelieferte Apple-Icon hat transparente Ecken, iOS füllt diese schwarz. Deshalb liegen in `public/assets/brand/` deckende Versionen (weißer Hintergrund, iOS rundet selbst ab), erzeugt aus `dulli-app-icon-1024.png`. Die maskierbaren Android-Icons haben Sicherheitsrand, damit Launcher sie beliebig zuschneiden können.

Theme-Color: `#00A6A9`. Manifest-Hintergrund: `#FFFFFF`. Die App meldet sich auf dem Homescreen als „Dulli“ (`apple-mobile-web-app-title`).

### 5. Typografie

Schrift der Oberfläche ist Nunito (`public/assets/fonts/Nunito-Variable.ttf`), ein gerundeter Schnitt, der zur Wortmarke passt.

| Rolle | Größe | Gewicht |
| --- | --- | --- |
| Seitentitel | 2rem (`--text-xl`) | 800 |
| Abschnittstitel | 1.15–1.4rem | 800 |
| Fließtext | 1rem | 400–600 |
| Labels, Chips | .8–.9rem | 700–800 |
| Hilfstext | .85rem, `--muted` | 400 |

Zeilenhöhe im Fließtext 1,5–1,6. Überschriften stehen in `--ink`, Hilfstexte in `--muted` (`#5F6F80`, mindestens 4,5:1 auf Weiß).

### 6. Form, Abstände, Tiefe

- Abstandsraster 4 px (`--space-1` bis `--space-9`).
- Radien: Chips und Buttons voll rund (999 px), Karten 20–26 px (`--radius-lg`, `--radius-xl`), Eingabefelder 14 px.
- Schatten sind weich und blau getönt: `--shadow-sm`, `--shadow-md`, `--shadow-lg`. Keine harten schwarzen Schatten.
- Touchflächen mindestens 44 × 44 px.
- Fokus immer sichtbar (`--focus-ring`, helles Türkis, plus 2 px Outline).
- Bewegungen kurz und optional. Bei `prefers-reduced-motion` entfallen sie.

### 7. Bedien- und Eingabeelemente

Die Live-Referenz aller Elemente ist die Seite **/styleguide** (`styleguide.html`). Sie nutzt die echten Klassen und zeigt sofort, wenn sich etwas verändert. Umgesetzt in `public/css/controls.css`, das nach dem Theme geladen wird und die Elemente plattformweit vereinheitlicht.

Zusatzfarben für die Oberfläche: Lila `#7B61FF` (`--lila`, sparsam für Sonderfälle wie Sport oder Gruppen), Nebelfarben `--fog-50` bis `--fog-500` (`#F6F8FA` bis `#8A9AAA`) für Ränder, Flächen und Platzhalter. Statusfarben: Info `#2F80ED`, Erfolg `#2F9E44`, Hinweis `#9A6B00` auf `#FFF3D1`, Fehler `#C62B3A` auf `#FFE6E9`, jeweils mit Tint-Hintergrund (`--info-tint` usw.).

#### Buttons

Alle Buttons haben 12 px Radius, mindestens 46 px Höhe und Schrift 800.

| Typ | Klasse | Aussehen | Wofür |
| --- | --- | --- | --- |
| Primär | `.primary-button`, `.jd-btn.primary` | Dunkelblau, weiße Schrift | Die eine Hauptaktion pro Ansicht (Speichern, Neue Aufgabe) |
| Sekundär | `.jd-btn` | Helltürkis, dunkle Schrift | Gleichwertige Nebenaktion |
| Tertiär | `.outline-button` | Weiß, grauer Rand | Abbrechen, Zurück |
| Destruktiv | `.jd-btn.danger` | Hellrot, rote Schrift | Löschen |
| Icon | `.jd-icon-btn` | Weiß, Rand, 44 px | Bearbeiten, Mehr |
| FAB | `.tabs-fab` | Türkis, rund | Schnell hinzufügen |

Zustände: Hover heller (`#0D4577`), Fokus mit weißem Abstandsring plus Türkis-Ring (`--ctl-ring`), deaktiviert grau (`--fog-300`), Laden über `aria-busy="true"` mit Spinner. Pro Ansicht gibt es höchstens einen primären Button.

#### Eingabefelder

Weiß, 1,5 px Rand `--fog-300`, 10 px Radius, 46 px Höhe, Platzhalter `--fog-500`. Hover und Fokus färben den Rand türkis, Fokus fügt einen weichen Ring hinzu. Fehler: `aria-invalid="true"` (roter Rand) plus Meldung darunter in `.dl-error`. Erfolg: `.dl-ok` (grüner Rand). Jedes Feld hat ein sichtbares Label, Fehlermeldungen nennen auch, was zu tun ist.

#### Formularelemente

- Textbereich und Auswahl wie Eingabefelder, mindestens 96 px bzw. 46 px hoch. Jedes Dropdown (`<select>`, einfach) zeigt rechts einen kleinen Pfeil nach unten: eine zentrale Regel in `controls.css` (Token `--ctl-chevron`), die in allen Komponenten gilt; Ausnahme `.jd-raw`, Mehrfachauswahl.
- Checkbox und Radio: 20 px, Türkis (`accent-color`).
- Schalter: Grün für „an“.
- Segmentierte Auswahl `.dl-segmented` mit `aria-pressed`.
- Stepper `.dl-stepper`, Chips `.dl-chip` (Türkis, `.sun`, `.green`, `.coral`, `.lila`) mit optionalem Entfernen-Button.

#### Navigation

Obere Tabs `.dl-tabs` mit türkiser Unterstreichung, Pill-Filter `.dl-pills` (aktiv: gefülltes Türkis), Seitenleiste mit hellem Türkis als aktivem Hintergrund, untere Navigation auf dem Smartphone mit FAB in der Mitte.

#### Feedback und Status

- Hinweisbanner `.dl-alert` in vier Varianten (`info`, `success`, `warn`, `error`), immer mit Symbol und Text, schließbar.
- Toast `.jd-toast`: weiß, grüner Streifen links, kurze Meldung.
- Fortschritt `.dl-progress` in Grün, Tooltip `.dl-tip` in Dunkelblau.
- Leerzustand `.dl-empty`: Titel, ein erklärender Satz, ein Button, der den ersten Eintrag anlegt.

#### Karten und Overlays

- Karte `.dl-card` (weiß, 16 px Radius), Erinnerung `.dl-card.reminder` (Gelb), Avatare `.dl-avatar` in der Farbe des Mitglieds.
- Dialoge: 18 px Radius, dunkelblauer Hintergrundschleier. Bestätigungsdialoge nennen die Folge und haben links Abbrechen, rechts die Aktion. Löschen ist rot.
- Menü `.dl-menu` mit 44 px hohen Einträgen, Löschen in Rot. Ausgewählter Tag im Datepicker `.dl-day[aria-selected=true]` in Grün.

### 8. Tag- und Nachtmodus

Nutzer schalten den Nachtmodus in den Einstellungen unter „Allgemein“ um („Nachtmodus“). Die Wahl gilt pro Gerät (`localStorage`-Schlüssel `jd-theme`, Wert `dark`). Ohne Wahl gilt der Tagmodus.

Technik:

- Ein kleines Inline-Skript im `<head>` jeder Seite setzt `data-theme="dark"` auf `<html>`, bevor etwas gezeichnet wird (kein Aufblitzen), und passt `theme-color` an. Es stellt `window.jdTheme` mit `get()`, `set('dark'|'light')` und `apply()` bereit.
- `public/css/dark.css` überschreibt nur Tokens und wenige Ausnahmen. Neue Komponenten verwenden deshalb Tokens statt fester Farben: Flächen `--paper`, `--fill`, `--fill-soft`, `--fill-2`, `--fill-3`, Text `--ink` und `--muted`, Ränder `--line` und `--fog-*`, Pastellflächen `--p-*`. Eine feste Farbe wie `#fff` als Hintergrund ist nicht erlaubt (Ausnahme: der Knopf eines Schalters und Text auf farbigen Flächen).
- Primäre Buttons nutzen `--btn-primary`, `--btn-primary-ink`, `--btn-primary-hover`: Tag dunkelblau mit weißer Schrift, Nacht türkis mit dunkler Schrift.
- Nachtfarben: Hintergrund `#0B1622`, Karten `#132235`, Text `#E9F1F8`, Hilfstext `#9FB1C3`, Aktion-Türkis `#0E9FA2`. Markenfarben für Logo, Herz, Avatare und Münzen bleiben unverändert.
- Logos: Jede Logo-`<img>` hat einen Zwilling mit `brand-logo--dark` (weiße Wortmarke). CSS blendet je nach Modus eines aus. Das Symbol auf dem Smartphone bleibt gleich.
- Jede neue Seite bindet das Frühskript, `public/css/site.css` und `public/css/dark.css` ein (Vorlage: `login.html`). Die App lädt alles als ein Stylesheet `/dulli.css`, das der Server aus den Quelldateien zusammensetzt (Reihenfolge: `server/bundles.mjs`); `dark.css` steht dort zuletzt.
- Kontrast gilt im Nachtmodus genauso: mindestens 4,5:1 für Text.

### 9. Technik

Reihenfolge der Stylesheets in der App (`server/bundles.mjs`): `foundation.css` (Marken- und Basis-Tokens, Rahmen), `today.css`, `forms.css`, `modules.css`, `planner.css`, `tokens.css`, `public/css/theme.css` (aktuelles Theme), Feature-Dateien, `public/css/controls.css` (Bedienelemente), `public/css/mobile.css`. Farben werden ausschließlich über Tokens verwendet, nie als neue Hex-Werte in Komponenten. Brauchst du eine neue Farbe, wird sie hier und in den Tokens ergänzt.

Neue Seite anlegen:

1. Im `<head>` Theme-Color, Icon-Links und `/css/site.css` wie in `login.html` einbinden.
2. Logo als `<a class="brand" aria-label="Dulli"><img class="brand-logo" alt="" …></a>`.
3. Name im Text immer „Dulli“.
4. Statische Dateien kommen nach `f/` (öffentlich ausgeliefert). Danach `CACHE` in `sw.js` erhöhen.

### 10. Branding-Dateien im Repo

`branding/` enthält das vollständige finale Logo-Set (`Dulli_Final_Logo_Set`: Master, Web, Favicon, Apple, Android, PWA, Vorschau, Einbindungs-Doku und Deploy-Ordner) und dient als Archiv. Ausgeliefert wird nur, was in `public/assets/brand/` liegt (Auswahl plus die deckenden iOS-Icons und das Social-Bild). Änderungen am Logo werden zuerst in `branding/` abgelegt und dann nach `public/assets/brand/` übernommen.

Hinweis aus der Lieferung: Vor einer kommerziellen Veröffentlichung Marken- und Domainrecherche durchführen und die Darstellung auf echten Geräten prüfen.

---

## Dulli Design System

> Das verbindliche Erscheinungsbild steht im [Dulli Designguide](dulli-design-guide.md). Dieses Dokument ist nur noch Hintergrund.


### Design intent

The interface is an original, Today-first household workspace. Visual priority is given to the next commitment, responsibility and one-tap action. Phase-2 tools stay out of primary navigation.

### Tokens

The canonical CSS tokens live in `styles.css` under `:root`:

| Token | Meaning | Current value |
| --- | --- | --- |
| `--ink` | primary text | `#042F57` |
| `--muted` | secondary text | `#6a7d83` |
| `--line` | borders and separators | `#dce5e3` |
| `--paper` | card and form surface | `#fff` |
| `--teal` | action accent | `#067F83` |
| `--coral` | attention accent | `#D9444F` |

### Responsive composition

- Compact: one column, thumb-reachable controls, bottom/compact navigation behavior.
- Medium: readable single workspace with additional context where space permits.
- Large: schedule and responsibilities remain parallel without stretching content.
- Extra large: added width supports parallel context, not decorative widget density.

### Interaction rules

- Every primary action is available to touch, pointer and keyboard.
- Interactive targets are at least 44px in the tested runtime.
- Focus-visible states are always visible.
- Reduced-motion users receive no required animation.
- Color is never the only carrier of completion or attention.
- Offline and local-only states use explicit recovery language.

### Component boundaries

Today, Calendar, Tasks and Lists share the same shell and semantic hierarchy. More contains optional tools. Domain behavior remains in the server/API layer; CSS and browser scripts do not define household permissions.

---

## Design-Spezifikation "Familienzentrale"

Dulli nutzt die eigene Marke (Haus-Familien-Zeichen, siehe dulli-design-guide.md), eigene Icons (Inline-SVG) und eine eigene Münze.

Code-Basis: `public/css/theme.css` (Tokens + Shell), `public/features/shell.js`, `public/assets/fonts/Nunito-Variable.ttf` (OFL). Alle Bereiche nutzen die Tokens (`--p-*`, `--d-*`, `--slot-*`).

### Grundlook
- Weißer Grund, viel Weißraum, **sehr runde** Formen (Radius 14-26px, Pills 999px), kaum Schatten, keine harten Rahmen (`--line` #e9edf1 nur für Raster).
- Schrift Nunito, Titel 800, Labels 700; Text #1f2933, gedämpft #8a94a0.
- Primärfarbe Blau `--teal` (#3a74e0; Name historisch), aktive Pills `--teal-tint` (#e6eefc) mit blauem Text. "Heute" = Koralle `--coral` #e8683f.
- Pastell-Farbpaare je Profil (Fläche `--p-*`, Akzent/Rand `--d-*`): peach, rose, mint, teal, lav, sky, sun, grey. Profilfarbe `#hex` -> Fläche per 78% Weißmischung (wie `pastel()` in `calendar-week-ui.js`), linker Rand 4px in voller Farbe.

### Shell (fertig, nicht ändern)
Links schlanke Seitenleiste 78px (#f4f5f8): Kalender, Schule, Aufgaben, Schätze, Essen, Listen (Inline-SVG-Icon + 10px-Label, aktiv = weißes Pill mit Schatten);
unten Sync-Button und bunter Rund-FAB "+" (öffnet Schnellerfassung). Kopfzeile weiß 64px: JD-Kachel, **"HH:MM | Haushaltsname"** (Klick = Heute),
rechts Profil-Avatare (Foto/Initiale mit farbigem Ring, Aufgaben-Badge), Gruppen-Pill (Familie), Zahnrad (Einstellungen).
Mobil (<760px): Bottom-Navigation Kalender/Aufgaben/Listen/Verwalten, FAB blau schwebend rechts unten.

### Kalender (Wochenansicht = Hero)
- Toolbar unter dem Titel: Pills-Gruppe (Monat/Woche/5 Tage/Tag/Profile) + Datumsbereich-Pills "15.07. - 19.07." (aktiv = blau getönt, daneben nächste Bereiche grau als Schnellsprung), Heute-Icon-Button, kleine Icon-Buttons statt Textbuttons.
- Tageskopf: "Mo. [15]" - heutiger Tag mit koralle Kreis um die Zahl; rechts im Kopf kleines "+" (grau).
- Zeitraster: Stundenlabels links grau/klein (6, 7, 8 ...), Rasterlinien sehr hell, **rote Jetzt-Linie** mit Punkt am linken Rand.
- Ereignisblöcke: pastellgefüllt, Radius 8px, 4px linker Rand dunkler, Titel 700 (Emoji erlaubt) + Zeit klein darunter, **kleiner Buchstaben-Badge** (Initiale des Profils) unten rechts; Ganztägiges als schmale Pills über dem Raster ("Geburtstag", "Dienstreise").
- Monatsansicht: Zellen mit Pastell-Chips "08:00 Titel", "+3" Überlauf, heutiger Tag koralle Zahl; Kopfzeile "Okt. '25 | November | Dezember" als Monats-Pills.
- Kein "Eure Haushaltswoche"-Titelblock, kein Eyebrow: Toolbar direkt unter der Kopfzeile, Grid füllt die Höhe.

### Aufgaben ("Chores")
- Board: Spalten pro Profil als **große pastellgetönte Spalten** (rose, mint, sky; Spalte "Allgemein" grau) mit Kopf: runder Foto-Avatar mit Fortschrittsring, Name, Münzzähler (goldene Pill), "+"-Button.
- Aufgabe = runde Pill (Radius 16) in Profil-Pastell mit Emoji links, Titel, darunter klein "Täglich", rechts Check-Kreis; erledigt = kräftige Profilfarbe, weißer Haken, Titel durchgestrichen.
- Kategorie-Leiste unten (Morgens/Tagsüber/Abends) als Segment-Pills mit Icon (Sonne, Klemmbrett, Mond); Mobil: Profil-Kopf mit Balken "2/5", Datums-Navigator "< Heute >", blauer breiter "+"-Button unten.
- "+X Münze" fliegt als weiße Pill mit Goldmünze hoch (Animation, reduce-motion aus).

### Schätze
Pro Profil Spalte/Karte mit Truhen-Kacheln (Bronze/Silber/Gold, große Truhen-Illustration als SVG), Preis mit Münze; Einlösen = Vollbild-Overlay: weiße Karte, Truhe öffnet sich, Münzregen/Konfetti.

### Essen
- Kopf: Pills "Mahlzeiten | Rezepte", Kalenderwoche-Pill "KW05" mit < > .
- Raster: 7 Spalten (Tage; heutiger Tag koralle Pill "Mi, 8."), **3 Zeilen** farbig getönt: Frühstück `--slot-breakfast`, Mittag `--slot-lunch`, Abend `--slot-dinner`. Kachel = quadratisch, großes Emoji/Foto zentriert, Name klein darunter; leere Slots getönt, "Wiederholen"-Icon bei Wiederholungen.
- Rezeptbox: Kachelgrid mit Foto/Emoji, Kategorie-Chips oben.

### Listen / Einkauf
- Tabs oben "Einkaufsliste [Badge] | Zutaten", Suchfeld, Kategorie-Chips (Alle, Obst & Gemüse, Milch, Brot, Fleisch & Fisch ...).
- Einkauf: **Kachelgrid** (beige `#f3ead9`-Kacheln, großes Emoji, Name, Mengen-Stepper "- 1 Stück +", "Menge"-Button); abgehakt = ausgegraut/unten.
- Gewöhnliche Listen: weiße Karte, runde Checkboxen (blau), durchgestrichen bei erledigt, Emoji vor dem Eintrag.

### Dialoge & Einstellungen
Weiße Sheets mit Radius 26px, großer Titel 800, Felder als hellgraue Pills (#f4f5f8, kein Rand), Primärbutton blau Pill, Sekundär grau; Einstellungen als Liste mit Icon-Kacheln und Switches (blau). Verwalten (Mobil) = Kachelraster aus Icon + Label.

### Bildermodus / Schlafmodus
Vollflächige Diashow, Uhr oben links klein, weiße Schrift mit Schatten.

---

## Dulli Styleguide (Parity-Paket)

> Das verbindliche Erscheinungsbild steht im [Dulli Designguide](dulli-design-guide.md). Dieses Dokument ist nur noch Hintergrund.


Ergänzt `docs/design.md`. Tokens: `public/css/foundation.css :root` (Basis) und `public/css/tokens.css` (Erweiterung). Eigenständiges Design, kein Dæly-Look.

### Prinzipien
- **Heute zuerst, ruhig, großzügig:** wenig Chrome, runde Karten, ein Akzent pro Bereich. Kein Spiele-/Social-Look.
- **Touch zuerst:** Ziele >= 44 px (`--jd-touch`), Fokus sichtbar, Farbe nie alleiniger Informationsträger (Emoji/Text/Icon dazu).
- **Wandbildschirm tauglich:** Bereiche skalieren bis 1920x1080; Schrift auf Distanz lesbar (Titel >= 1.1rem).
- **Reduced motion:** Konfetti/Überblendungen entfallen bei `prefers-reduced-motion`.

### Farben
| Token | Verwendung |
| --- | --- |
| `--ink` #173b4d | Text, Navigation |
| `--teal` #2b8c87 | Primäraktion, erledigt |
| `--coral` #e97962 | Achtung, Löschen |
| `--jd-gold/silver/bronze` | Münzen & Truhen (Bronze, Silber, Gold) |
| `--jd-morning/day/evening` | Tageszeit-Kategorien für Aufgaben |
| `--jd-soft-*` | Flächen-Tönungen |
| Profilfarben | `window.jdMemberColor(name)` bzw. gewählte Profilfarbe (`extras.profiles`) |

### Komponenten (`public/css/tokens.css`)
`.jd-card`, `.jd-btn(.primary/.danger)`, `.jd-chip`, `.jd-field`, `.jd-switch`. Neue Panels: `<section class="card …-panel">` mit
`card-heading` (Eyebrow + H2) und `‹ More`-Zurückbutton wie in `optional.js`.

### Persistenz & Struktur
- Alle neuen Haushaltsdaten über `window.jdExtras.get/set/subscribe(key)` (server: `PUT /api/extras/:key`, Schlüssel-Whitelist in `server.mjs`).
- Module in `f/<name>.js` (+ `f/<name>.css`), geladen von `features.js`. Texte englisch im Code, Übersetzung über `i18n-ui.js` (`'Text':'Übersetzung'`).
- Panels öffnen aus "More" (`.tool-grid`) und blenden Geschwister mit der Klasse in `navigation.js`/`optional.js` aus.
