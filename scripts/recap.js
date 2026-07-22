/** Spieler-Rückblick: „Was bisher geschah" – erzeugt aus den letzten
 *  Chronik-Seiten einen Rückblick als für Spieler sichtbares Journal. */

import { aiConfigured, callAI } from "./ai.js";

const MODULE_ID = "nics-gm-toolkit";
const FOLDER_NAME = "GM Toolkit";
const RECAP_NAME = "Was bisher geschah";
const HIGHLIGHT_ICONS = ["📌", "📜", "⚔️", "🏁", "☠️", "💀", "🗺️", "🎒"];

export class Recap {

  static registerSettings() {
    game.settings.register(MODULE_ID, "recapSessions", {
      name: "Rückblick: Anzahl Sessions",
      hint: "Wie viele der letzten Chronik-Seiten in den Rückblick einfließen.",
      scope: "world", config: true, type: Number, default: 1,
      range: { min: 1, max: 5, step: 1 }
    });
    game.settings.register(MODULE_ID, "recapOnStart", {
      name: "Rückblick: Beim Sessionstart den Spielern zeigen",
      hint: "Zeigt beim Start der Session-Chronik automatisch den zuletzt erstellten Rückblick.",
      scope: "world", config: true, type: Boolean, default: false
    });
  }

  /** Sammelt Höhepunkte aus den letzten Chronik-Seiten. */
  static collectHighlights() {
    const journal = game.journal.find(j => j.name === "Session-Chronik" && j.folder?.name === FOLDER_NAME);
    if (!journal) return null;
    const pages = journal.pages.contents.filter(p => p.type === "text");
    if (!pages.length) return null;

    const n = game.settings.get(MODULE_ID, "recapSessions");
    const recent = pages.slice(-n);
    const sessions = [];

    for (const page of recent) {
      const div = document.createElement("div");
      div.innerHTML = page.text?.content ?? "";
      const highlights = [];
      const summary = [];
      let inSummary = false;
      for (const el of div.children) {
        if (el.tagName === "H3" && el.textContent.includes("Zusammenfassung")) { inSummary = true; continue; }
        if (inSummary && el.tagName === "UL") {
          for (const li of el.querySelectorAll("li")) summary.push(li.textContent.trim());
          inSummary = false;
          continue;
        }
        const text = el.textContent.trim();
        if (!text) continue;
        if (HIGHLIGHT_ICONS.some(icon => text.includes(icon))) {
          // Zeitstempel entfernen
          highlights.push(text.replace(/^\d{1,2}:\d{2}\s*/, ""));
        }
      }
      sessions.push({ name: page.name, highlights, summary });
    }
    return sessions;
  }

  /** Erzeugt/aktualisiert das Rückblick-Journal. */
  static async generate({ show = false } = {}) {
    const sessions = this.collectHighlights();
    if (!sessions?.length) {
      ui.notifications.warn("Keine Chronik-Seiten gefunden – erst eine Session aufzeichnen.");
      return null;
    }

    let body = "";
    for (const s of sessions) {
      body += `<h3>${s.name}</h3>`;
      if (s.highlights.length) {
        body += `<ul>${s.highlights.map(h => `<li>${h}</li>`).join("")}</ul>`;
      }
      if (s.summary.length) {
        body += `<p><em>${s.summary.join(" · ")}</em></p>`;
      }
      if (!s.highlights.length && !s.summary.length) {
        body += `<p><em>Keine markierten Ereignisse – nutze 📌 im Chat, um Momente zu merken.</em></p>`;
      }
    }

    // Optional: KI formuliert den Rückblick als Erzähltext aus
    if (aiConfigured()) {
      try {
        const raw = sessions.map(s =>
          `${s.name}:\n${s.highlights.join("\n")}\n${s.summary.join("\n")}`).join("\n\n");
        const prose = await callAI(
          `Formuliere aus diesen D&D-Session-Notizen einen kurzen, stimmungsvollen Rückblick ("Was bisher geschah") für die Spieler. 2-3 Absätze, deutsch, keine Spoiler über GM-Geheimnisse, Präteritum:\n\n${raw}`,
          { system: "Du bist ein Erzähler für eine D&D-Runde. Antworte nur mit dem Rückblickstext." }
        );
        if (prose) {
          body = prose.split(/\n\s*\n/).map(p => `<p>${p.trim()}</p>`).join("") +
            `<hr><details><summary>Stichpunkte</summary>${body}</details>`;
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | KI-Rückblick fehlgeschlagen, nutze Stichpunkte`, err);
      }
    }

    const content = `<h2>${RECAP_NAME}</h2>${body}<p><em>Stand: ${new Date().toLocaleDateString("de-DE")}</em></p>`;

    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === FOLDER_NAME);
    folder ??= await Folder.create({ name: FOLDER_NAME, type: "JournalEntry" });
    let entry = game.journal.find(j => j.name === RECAP_NAME && j.folder?.id === folder.id);
    if (!entry) {
      entry = await JournalEntry.create({
        name: RECAP_NAME,
        folder: folder.id,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        pages: [{ name: RECAP_NAME, type: "text", text: { content } }]
      });
    } else {
      const page = entry.pages.contents[0];
      if (page) await page.update({ "text.content": content });
    }

    ui.notifications.info("Rückblick aktualisiert.");
    if (show) {
      try {
        await entry.show();
      } catch (err) {
        entry.sheet.render(true);
      }
    } else {
      entry.sheet.render(true);
    }
    return entry;
  }
}
