# Nics GM Toolkit

Foundry-VTT-Modul für D&D 5e, das die Funktionen des DnD Toolkits und des Session-Recorders
direkt in Foundry bringt. Für Foundry **v13 und v14**.

## Funktionen

**📖 Session-Chronik** – Ein Klick auf „Chronik" in der Journal-Seitenleiste startet die
Aufzeichnung: Chat-Nachrichten, Würfelwürfe, Kampfbeginn/-runden/-ende und Szenenwechsel
landen automatisch mit Uhrzeit in einem Journal („GM Toolkit → Session-Chronik", eine Seite
pro Session). Was protokolliert wird, steuerst du in den Moduleinstellungen. Nochmal
klicken beendet die Session.

**👤 NPC-Generator** – Zufalls-NSCs mit Name (nach Volk und Geschlecht), Aussehen,
Persönlichkeit, Stimme, Marotte, Motivation und Geheimnis (als GM-Geheimnis-Block).
Per Knopfdruck als dnd5e-Actor, Journal-Eintrag oder Chat-Flüsternachricht.

**💰 Loot-Generator** – Beute nach Herausforderungsgrad: Münzen, Edelsteine, magische
Gegenstände (nach Seltenheit gewichtet) und Kuriositäten. Gegenstände werden automatisch
mit passenden Einträgen aus deinen Item-Kompendien verlinkt, wenn vorhanden.

**🔗 Verknüpfungs-Assistent** – Durchsucht eine Journal-Seite nach Namen deiner
vorhandenen Journale, Actors, Items und Szenen und macht daraus klickbare
@UUID-Verknüpfungen — das dnd-scribe-Prinzip, aber mit Foundrys eigenem Journal.

## Installation (lokal)

1. Den Ordner `nics-gm-toolkit` nach `<Foundry-Datenordner>/Data/modules/` kopieren.
   Unter Windows üblicherweise: `%localappdata%/FoundryVTT/Data/modules/`
2. Foundry starten → Welt laden → Spieleinstellungen → Module verwalten → „Nics GM Toolkit" aktivieren.

## Installation (über GitHub, wie beim DnD Toolkit)

1. Repo anlegen (z. B. `klopsnic-cyber/nics-gm-toolkit`) und diesen Ordnerinhalt pushen.
2. Release erstellen: Ordnerinhalt als `module.zip` packen (module.json muss im ZIP-Wurzelverzeichnis liegen)
   und zusammen mit der `module.json` als Release-Assets hochladen.
3. In Foundry: Add-on-Module → Modul installieren → Manifest-URL:
   `https://github.com/klopsnic-cyber/nics-gm-toolkit/releases/latest/download/module.json`

Release-Ablauf (analog zum DnD Toolkit):
```bat
cd /d C:\Users\nic\Desktop\nics-gm-toolkit
git add .
git commit -m "Version 1.0.0"
git push
git tag v1.0.0
git push origin v1.0.0
```
(Danach im GitHub-Release `module.json` + `module.zip` anhängen — oder später eine
GitHub Action einrichten, die das automatisch macht.)

## Bedienung

Alle Werkzeuge findest du an zwei Stellen (nur als GM sichtbar):
- **Journal-Seitenleiste** (Reiter „Journal"): Buttons Chronik / NSC / Loot / Links
- **Szenen-Steuerleiste**: Werkzeuge unter den Journal-Notizen

Für Makros steht eine API bereit:
```js
const api = game.modules.get("nics-gm-toolkit").api;
api.openNpcGenerator();
api.openLootGenerator();
api.openLinkAssistant();
api.toggleChronicle();
```

## Einstellungen

Unter Spieleinstellungen → Moduleinstellungen:
- Chat-Nachrichten protokollieren (an/aus)
- Würfelwürfe protokollieren (an/aus)
- Kampfereignisse protokollieren (an/aus)
- Szenenwechsel protokollieren (an/aus)
- Flüster-Nachrichten protokollieren (standardmäßig aus)

## Neu in v1.2/v1.3

**NPC-Generator:** Gesinnung wird mitgewürfelt; jedes Feld hat ein Würfel-Symbol zum
einzelnen Neuwürfeln; der ⚡-Button in der Journal-Leiste flüstert dir ohne Fenster
sofort einen kompletten NSC in den Chat.

**Eigene Tabellen:** Lege eine Datei `gmtk-tables.json` in deinen Foundry-Datenordner
(`Data/gmtk-tables.json`), um eigene Einträge zu ergänzen — Format siehe Kommentar in
`scripts/data.js` (Schlüssel: aussehen, persoenlichkeit, stimme, motivation, geheimnis,
marotte, aufhaenger, taschen, vornamen, nachnamen).

**Chronik Plus:** Beim Beenden hängt die Chronik automatisch eine Zusammenfassung an
(Dauer, Szenen, Kämpfe, besiegte Gegner, gefallene Helden, erhaltene Gegenstände,
natürliche 20er/1er). Jede Chat-Nachricht hat für den GM ein 📌-Symbol, um sie manuell
in die Chronik zu übernehmen. Der Export-Button neben „Chronik" speichert die letzte
Session als Markdown-Datei.

## Neu in v1.4–v1.7

**NSC-Kartei** (Adressbuch-Symbol): alle generierten NSCs durchsuchbar, filterbar nach
Beruf/Volk/Klasse, mit Beziehungen zwischen NSCs (kennt, hasst, schuldet etwas, arbeitet
für …) — beidseitig gespeichert und klickbar.

**Begegnungs-Generator** (Drachen-Symbol): Zufallsbegegnungen nach Gruppengröße, Stufe,
Schwierigkeit (DMG-XP-Budget) und Gelände. Zieht Monster aus deinen Actor-Kompendien und
platziert sie auf Wunsch als versteckte Tokens in der Szenenmitte.

**Händler-Generator** (Laden-Symbol): Läden mit Inventar und Preisen aus deinen
Item-Kompendien, inklusive generiertem Inhaber-NSC und Feilsch-Wurf (W20).

**Quest-Tracker** (Schriftrollen-Symbol): Quests mit Status (offen/aktiv/erledigt/
gescheitert), Auftraggeber aus der NSC-Kartei und Belohnung. Statuswechsel landen
automatisch in der Session-Chronik.

## Neu in v1.8–v2.0

**Spieler-Rückblick** (Uhr-Symbol): erzeugt aus den letzten Chronik-Seiten ein für Spieler
sichtbares Journal „Was bisher geschah" (Höhepunkte: 📌-Markierungen, Quests, Kämpfe,
Szenen plus Zusammenfassung). Einstellung „Beim Sessionstart zeigen" blendet es beim
Start der Chronik automatisch bei allen ein.

**Atmosphäre** (Masken-Symbol): Stimmungs-Schalter für Taverne, Stadt, Reise, Lagerfeuer,
Kampf, Grusel und Stille. Wechselt die Playlist (Namen in den Moduleinstellungen
zuordnen) und optional die Szenen-Dunkelheit mit sanfter Überblendung.

**KI-Anbindung (optional):** In den Einstellungen Anbieter (Anthropic/OpenAI) und
API-Schlüssel hinterlegen. Dann formuliert der ✨-Button im NPC-Generator Beschreibungen
zum Vorlesen aus, und der Rückblick wird als Erzähltext statt Stichpunkten geschrieben.
Ohne Schlüssel bleibt alles wie gehabt.

## Veröffentlichung im Foundry-Verzeichnis

1. Konto auf foundryvtt.com anlegen (falls nicht vorhanden) und einloggen.
2. Unter „Administration → Packages" ein neues Paket anlegen: Typ „Module",
   ID exakt `nics-gm-toolkit`.
3. Beim Paket einen Release eintragen: Version (z. B. 2.0.0) und die Manifest-URL
   der versionierten Release-Datei:
   `https://github.com/klopsnic-cyber/nics-gm-toolkit/releases/download/v2.0.0/module.json`
4. Nach Freischaltung erscheint das Modul in der Foundry-Modulsuche.

## English (short)

German-language GM toolkit for D&D 5e on Foundry VTT v13/v14. Features: automatic
session chronicle with summary and markdown export, NPC generator (classes, spells,
rerollable fields, AI-assisted descriptions), NPC directory with relationships, loot,
encounter (XP budget, terrain) and merchant generators, quest tracker, player recap,
mood/atmosphere switcher. UI is currently German; translations welcome.

## Hinweise

- Die Chronik schreibt gesammelt etwa alle 8 Sekunden ins Journal (schont die Datenbank).
- Es protokolliert nur der aktive GM — keine doppelten Einträge bei mehreren GMs.
- Das Chronik-Journal ist standardmäßig nur für GMs sichtbar.
