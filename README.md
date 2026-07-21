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

## Hinweise

- Die Chronik schreibt gesammelt etwa alle 8 Sekunden ins Journal (schont die Datenbank).
- Es protokolliert nur der aktive GM — keine doppelten Einträge bei mehreren GMs.
- Das Chronik-Journal ist standardmäßig nur für GMs sichtbar.
