# Dulli – Web Brandkit (3. November 2026)

**Korrigierte Fassung vom 3. November 2026:** Die Bounding-Boxen für Symbol und Schrift wurden anhand der tatsächlichen Pixelgrenzen erweitert. Bisher wurde die grüne Linie bei 932 statt 945 Pixeln abgeschnitten; der Wortzug bei 1206 statt 1220 Pixeln. Der Master wurde nicht verändert. SVG- und Icon-Ausgaben wurden neu erzeugt.

**Quelle:** `a_clean_high_resolution_vector_style_logo_on_a_pu.png` – die letzte, vom Nutzer bestätigte Dulli-Abbildung mit gleichmäßigem weißen Abstand zwischen grünem Bogen und Haus/Figuren.

## Was ist exakt, was ist nachgezeichnet?
- `00_master/dulli-original-unveraendert.png`: ursprüngliche Abbildung, pixelidentisch und einschließlich des weißen Hintergrunds.
- `00_master/dulli-logo-pixelidentisch-bild-im-svg.svg`: genau diese PNG-Bilddaten im SVG-Container; **keine** echte Vektorgrafik.
- `00_master/dulli-master-transparent.png`: aus dem weißen Hintergrund freigestellte Version, am Rand minimal anders wegen des Transparenz-Alphakanals.
- `00_master/dulli-logo-vektor-nachgezeichnet.svg`: echte, skalierbare SVG-Vektorpfade, farblich und geometrisch **angenähert**, nicht pixelidentisch; zur finalen Druckfreigabe am besten manuell prüfen.
- `01_website/dulli-logo-horizontal-*.svg`: aus dem nachgezeichneten Vektor aufgebaut; PNG-Versionen sind aus der letzten Original-Abbildung zusammengesetzt.
- Der Wortzug und das Haus in den PNG-Versionen stammen aus derselben Originaldatei und wurden **nicht kreativ geändert**.

## Inhalte
- **00_master:** Originaldatei, freigestellte Logos und SVG-Nachzeichnung.
- **01_website:** gestapelte und horizontale Logos, helle / dunkle Varianten, PNG und SVG.
- **02_favicon:** SVG, ICO mit mehreren Auflösungen, PNG 16–512 px, dunkle Varianten.
- **03_apple:** Apple Touch Icons, inklusive 180×180.
- **04_android:** Standard- und Maskable-Icons, Android Adaptive SVG-Layer.
- **05_social:** Open-Graph-, Twitter- und quadratische Vorschaubilder, jeweils Hell / Dunkel.

## Verwendung

**Hinweis:** Kleine Icons verwenden ausschließlich das Haussymbol, damit es im Browser oder auf dem Smartphone gut erkennbar bleibt. SVG-Trace-Dateien und die daraus gerenderten Icons sollten vor einem endgültigen Marken-Launch visuell geprüft werden.
