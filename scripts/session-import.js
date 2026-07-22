/** Session-Import: wertet Transkripte (z. B. aus dnd-scribe) per KI aus und
 *  legt nach Bestätigung NSCs, Orte, Quests und Ereignisse in Foundry an. */

import { aiConfigured, callAI } from "./ai.js";
import { Chronicle } from "./chronicle.js";

const MODULE_ID = "nics-gm-toolkit";
const IMPORT_DIR = "gmtk-import";
const CHUNK_SIZE = 9000;

const EXTRACT_SYSTEM = `Du extrahierst Fakten aus D&D-Session-Transkripten. Antworte AUSSCHLIESSLICH mit gültigem JSON nach diesem Schema:
{"nscs":[{"name":"","beschreibung":"","rolle":""}],"orte":[{"name":"","beschreibung":""}],"quests":[{"name":"","beschreibung":"","auftraggeber":""}],"gegenstaende":[{"name":"","beschreibung":"","besitzer":""}],"ereignisse":["kurzer Satz je Ereignis"]}
Nur tatsächlich im Text vorkommende Dinge. Spielernamen sind keine NSCs. Deutsch. Leere Listen sind erlaubt.`;

export class SessionImport extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new SessionImport();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-session-import",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "Session-Import (KI)", icon: "fa-solid fa-file-import" },
    position: { width: 640, height: 640 },
    actions: {
      loadFile: SessionImport.#onLoadFile,
      pickLocalFile: SessionImport.#onPickLocalFile,
      analyze: SessionImport.#onAnalyze,
      apply: SessionImport.#onApply
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/session-import.hbs`,
      scrollable: [".gmtk-import-preview"]
    }
  };

  files = [];
  transcript = "";
  parsed = null;
  busy = false;

  async _prepareContext() {
    // Dateien aus Data/gmtk-import auflisten (falls Ordner existiert)
    this.files = [];
    try {
      const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
      const result = await FP.browse("data", IMPORT_DIR);
      this.files = result.files.filter(f => /\.(txt|json|md)$/i.test(f));
    } catch (err) { /* Ordner existiert noch nicht */ }

    return {
      files: Object.fromEntries(this.files.map(f => [f, f.split("/").pop()])),
      hasFiles: this.files.length > 0,
      transcript: this.transcript,
      parsed: this.parsed,
      busy: this.busy,
      aiReady: aiConfigured()
    };
  }

  /* ---------------------------------- Laden & Analysieren ---------------------------------- */

  /** Verarbeitet Dateiinhalt: Extrakt-JSON direkt, sonst als Transkript. */
  #ingest(text, filename) {
    if (filename.toLowerCase().endsWith(".json")) {
      try {
        const data = JSON.parse(text);
        // dnd-scribe-Extrakt? Dann ist keine KI-Analyse mehr nötig.
        if (data.nscs || data.orte || data.quests || data.gegenstaende) {
          this.transcript = "";
          this.parsed = SessionImport.tagParsed(data);
          this.render();
          ui.notifications.info("dnd-scribe-Extrakt erkannt – Vorschau ohne KI-Analyse erstellt.");
          return;
        }
        text = data.transcript ?? data.text ??
          (Array.isArray(data.segments) ? data.segments.map(s => `${s.speaker ?? ""}: ${s.text ?? ""}`).join("\n") : text);
      } catch (err) { /* dann als Rohtext behandeln */ }
    }
    this.transcript = text;
    this.parsed = null;
    this.render();
    ui.notifications.info(`${filename} geladen (${Math.round(text.length / 1000)} kZeichen).`);
  }

  /** Datei direkt vom eigenen PC einlesen – funktioniert auch bei gehostetem Foundry. */
  static #onPickLocalFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.json,.md";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.#ingest(String(reader.result ?? ""), file.name);
      reader.onerror = () => ui.notifications.error("Datei konnte nicht gelesen werden.");
      reader.readAsText(file, "utf-8");
    });
    input.click();
  }

  static async #onLoadFile() {
    const sel = this.element.querySelector('[name="import-file"]');
    if (!sel?.value) return;
    try {
      const resp = await fetch(sel.value);
      const text = await resp.text();
      this.#ingest(text, sel.value.split("/").pop());
    } catch (err) {
      ui.notifications.error("Datei konnte nicht geladen werden.");
    }
  }

  static async #onAnalyze() {
    const ta = this.element.querySelector('[name="transcript"]');
    this.transcript = ta?.value?.trim() ?? this.transcript;
    if (!this.transcript) return ui.notifications.warn("Erst ein Transkript einfügen oder eine Datei laden.");
    // Eingefügtes Extrakt-JSON? Dann direkt übernehmen, ohne KI.
    if (this.transcript.startsWith("{")) {
      try {
        const data = JSON.parse(this.transcript);
        if (data.nscs || data.orte || data.quests || data.gegenstaende) {
          this.parsed = SessionImport.tagParsed(data);
          this.render();
          ui.notifications.info("dnd-scribe-Extrakt erkannt – Vorschau ohne KI-Analyse erstellt.");
          return;
        }
      } catch (err) { /* kein JSON – normal weiter */ }
    }
    if (!aiConfigured()) return ui.notifications.warn("Erst in den Moduleinstellungen eine KI konfigurieren (z. B. Ollama).");

    this.busy = true;
    this.parsed = null;
    this.render();

    try {
      // Lange Transkripte in Stücke teilen und Ergebnisse zusammenführen
      const chunks = [];
      for (let i = 0; i < this.transcript.length; i += CHUNK_SIZE) {
        chunks.push(this.transcript.slice(i, i + CHUNK_SIZE + 500));
      }
      const merged = { nscs: [], orte: [], quests: [], gegenstaende: [], ereignisse: [] };
      let n = 0;
      for (const chunk of chunks) {
        n++;
        if (chunks.length > 1) ui.notifications.info(`Analysiere Teil ${n}/${chunks.length} …`);
        const raw = await callAI(`Transkript-Ausschnitt:\n\n${chunk}`, { system: EXTRACT_SYSTEM, maxTokens: 1500, json: true });
        const data = this.#parseJson(raw);
        if (!data) continue;
        for (const key of ["nscs", "orte", "quests", "gegenstaende"]) {
          for (const item of data[key] ?? []) {
            if (!item?.name) continue;
            if (!merged[key].some(e => e.name.toLowerCase() === item.name.toLowerCase())) merged[key].push(item);
          }
        }
        for (const ev of data.ereignisse ?? []) {
          if (ev && !merged.ereignisse.includes(ev)) merged.ereignisse.push(ev);
        }
      }

      this.parsed = SessionImport.tagParsed(merged);
    } catch (err) {
      console.error(`${MODULE_ID} | Analyse fehlgeschlagen`, err);
      ui.notifications.error(`KI-Analyse fehlgeschlagen: ${err.message}`);
    }
    this.busy = false;
    this.render();
  }

  /** Versieht ein Extraktions-Ergebnis mit IDs und Duplikat-Markierungen. */
  static tagParsed(merged) {
    const existing = new Set(game.journal.contents.map(j => j.name.toLowerCase()));
    const tag = (list, type) => (list ?? []).filter(x => x?.name).map((item, i) => ({
      ...item, type, id: `${type}-${i}`,
      exists: existing.has(item.name.toLowerCase())
    }));
    const ereignisse = (merged.ereignisse ?? []).filter(Boolean)
      .map((e, i) => ({ text: typeof e === "string" ? e : (e.text ?? ""), id: `ereignis-${i}` }))
      .filter(e => e.text);
    const parsed = {
      nscs: tag(merged.nscs, "nsc"),
      orte: tag(merged.orte, "ort"),
      quests: tag(merged.quests, "quest"),
      gegenstaende: tag(merged.gegenstaende, "gegenstand"),
      ereignisse
    };
    parsed.empty = !parsed.nscs.length && !parsed.orte.length && !parsed.quests.length
      && !parsed.gegenstaende.length && !parsed.ereignisse.length;
    return parsed;
  }

  static #parseJson(raw) {
    try { return JSON.parse(raw); } catch (err) { /* weiter */ }
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (err) { /* aufgeben */ }
    }
    return null;
  }

  /* ---------------------------------- Übernehmen ---------------------------------- */

  static async #onApply() {
    if (!this.parsed) return;
    const checked = new Set([...this.element.querySelectorAll('input[name="imp"]:checked')].map(el => el.value));
    if (!checked.size) return ui.notifications.warn("Nichts ausgewählt.");

    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === "GM Toolkit");
    folder ??= await Folder.create({ name: "GM Toolkit", type: "JournalEntry" });

    let created = 0;
    const createdNpcs = {};

    // NSCs zuerst (damit Quests ihre Auftraggeber finden)
    for (const n of this.parsed.nscs.filter(x => checked.has(x.id) && !x.exists)) {
      const entry = await JournalEntry.create({
        name: n.name, folder: folder.id,
        pages: [{ name: n.name, type: "text", text: { content:
          `<p>${n.beschreibung ?? ""}</p>${n.rolle ? `<p><b>Rolle:</b> ${n.rolle}</p>` : ""}<p><em>Importiert aus Session-Transkript.</em></p>` } }],
        flags: { [MODULE_ID]: { npc: { roleLabel: n.rolle ?? "" } } }
      });
      createdNpcs[n.name.toLowerCase()] = entry;
      created++;
    }

    for (const o of this.parsed.orte.filter(x => checked.has(x.id) && !x.exists)) {
      await JournalEntry.create({
        name: o.name, folder: folder.id,
        pages: [{ name: o.name, type: "text", text: { content:
          `<p>${o.beschreibung ?? ""}</p><p><em>Importiert aus Session-Transkript.</em></p>` } }]
      });
      created++;
    }

    for (const q of this.parsed.quests.filter(x => checked.has(x.id) && !x.exists)) {
      const giver = q.auftraggeber
        ? (createdNpcs[q.auftraggeber.toLowerCase()] ?? game.journal.find(j => j.name.toLowerCase() === q.auftraggeber.toLowerCase()))
        : null;
      await JournalEntry.create({
        name: q.name, folder: folder.id,
        pages: [{ name: q.name, type: "text", text: { content:
          `<p data-gmtk-status><b>Status:</b> Offen</p><p>${q.beschreibung ?? ""}</p>` +
          (giver ? `<p><b>Auftraggeber:</b> @UUID[${giver.uuid}]{${giver.name}}</p>` : (q.auftraggeber ? `<p><b>Auftraggeber:</b> ${q.auftraggeber}</p>` : "")) } }],
        flags: { [MODULE_ID]: { quest: {
          status: ({ offen: "offen", laufend: "aktiv", erledigt: "erledigt" })[q.status] ?? "offen",
          giverUuid: giver?.uuid ?? null, reward: "" } } }
      });
      created++;
    }

    // Gegenstände + Ereignisse gesammelt als Import-Protokoll
    const items = this.parsed.gegenstaende.filter(x => checked.has(x.id));
    const events = this.parsed.ereignisse.filter(x => checked.has(x.id));
    if (items.length || events.length) {
      const parts = [];
      if (events.length) parts.push(`<h3>Ereignisse</h3><ul>${events.map(e => `<li>${e.text}</li>`).join("")}</ul>`);
      if (items.length) parts.push(`<h3>Gegenstände</h3><ul>${items.map(i =>
        `<li><b>${i.name}</b>${i.besitzer ? ` (${i.besitzer})` : ""}${i.beschreibung ? ` – ${i.beschreibung}` : ""}</li>`).join("")}</ul>`);
      const name = `Session-Import ${new Date().toLocaleDateString("de-DE")}`;
      const journal = game.journal.find(j => j.name === "Session-Chronik" && j.folder?.id === folder.id)
        ?? await JournalEntry.create({ name: "Session-Chronik", folder: folder.id });
      await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name, type: "text", text: { content: parts.join("\n") }
      }]);
      created++;
    }

    ui.notifications.info(`${created} Einträge angelegt.`);
    Chronicle.log("📥", `Session-Import: ${created} Einträge übernommen.`);
    this.parsed = null;
    this.render();
  }
}

/** Beim Start prüfen, ob neue Transkripte im Import-Ordner liegen. */
export async function checkImportFolder() {
  try {
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    const result = await FP.browse("data", IMPORT_DIR);
    const files = result.files.filter(f => /\.(txt|json|md)$/i.test(f));
    const seen = game.settings.get(MODULE_ID, "importSeen");
    const fresh = files.filter(f => !seen.includes(f));
    if (fresh.length) {
      ui.notifications.info(`${fresh.length} neue Session-Aufzeichnung(en) im Import-Ordner – öffne den Session-Import (📥).`);
      await game.settings.set(MODULE_ID, "importSeen", files);
    }
  } catch (err) { /* Ordner existiert nicht – ok */ }
}

export function registerImportSettings() {
  game.settings.register(MODULE_ID, "importSeen", {
    scope: "world", config: false, type: Array, default: []
  });
}
