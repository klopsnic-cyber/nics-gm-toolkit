/** Session-Chronik: protokolliert Chat, Würfe, Kämpfe und Szenenwechsel in ein Journal.
 *  v1.3: Session-Zusammenfassung, 📌-Merken-Button im Chat, Markdown-Export. */

const MODULE_ID = "nics-gm-toolkit";
const FOLDER_NAME = "GM Toolkit";
const JOURNAL_NAME = "Session-Chronik";

export class Chronicle {

  static #buffer = [];
  static #flushSoon = null;
  static #stats = null;

  /* ---------------------------------- Setup ---------------------------------- */

  static registerSettings() {
    game.settings.register(MODULE_ID, "chronicleActive", {
      scope: "world", config: false, type: Boolean, default: false
    });
    game.settings.register(MODULE_ID, "chroniclePageUuid", {
      scope: "world", config: false, type: String, default: ""
    });
    game.settings.register(MODULE_ID, "logChat", {
      name: "Chronik: Chat-Nachrichten protokollieren",
      hint: "Gesprochenes (IC/OOC) landet in der Session-Chronik.",
      scope: "world", config: true, type: Boolean, default: true
    });
    game.settings.register(MODULE_ID, "logRolls", {
      name: "Chronik: Würfelwürfe protokollieren",
      scope: "world", config: true, type: Boolean, default: true
    });
    game.settings.register(MODULE_ID, "logCombat", {
      name: "Chronik: Kampfereignisse protokollieren",
      hint: "Kampfbeginn, Rundenwechsel und Kampfende.",
      scope: "world", config: true, type: Boolean, default: true
    });
    game.settings.register(MODULE_ID, "logScenes", {
      name: "Chronik: Szenenwechsel protokollieren",
      scope: "world", config: true, type: Boolean, default: true
    });
    game.settings.register(MODULE_ID, "logWhispers", {
      name: "Chronik: Auch Flüster-Nachrichten protokollieren",
      scope: "world", config: true, type: Boolean, default: false
    });
    game.settings.register(MODULE_ID, "logItems", {
      name: "Chronik: Erhaltene Gegenstände protokollieren",
      hint: "Wenn ein Spielercharakter einen Gegenstand erhält.",
      scope: "world", config: true, type: Boolean, default: true
    });
  }

  static init() {
    this.#flushSoon = foundry.utils.debounce(() => this.flush(), 8000);
    this.#resetStats();

    Hooks.on("createChatMessage", (msg) => this.#onChatMessage(msg));
    Hooks.on("combatStart", (combat) => {
      if (!this.#shouldLog("logCombat")) return;
      this.#stats.combats++;
      const names = combat.combatants.map(c => c.name).join(", ");
      this.log("⚔️", `<b>Kampf beginnt!</b> Beteiligte: ${names || "unbekannt"}`);
    });
    Hooks.on("combatRound", (combat, updateData) => {
      if (!this.#shouldLog("logCombat")) return;
      this.log("⚔️", `Kampf – Runde ${updateData.round}`);
    });
    Hooks.on("deleteCombat", (combat) => {
      if (!this.#shouldLog("logCombat")) return;
      this.log("🏁", `<b>Kampf beendet</b> nach ${combat.round} Runde(n).`);
    });
    Hooks.on("updateCombatant", (combatant, changes) => {
      if (!this.#shouldLog("logCombat")) return;
      if (changes.defeated !== true) return;
      if (combatant.actor?.type === "character") {
        this.#stats.fallen.push(combatant.name);
        this.log("💀", `<b>${combatant.name}</b> ist gefallen!`);
      } else {
        this.#stats.kills.push(combatant.name);
        this.log("☠️", `${combatant.name} wurde besiegt.`);
      }
    });
    Hooks.on("canvasReady", (canvas) => {
      if (!this.#shouldLog("logScenes")) return;
      if (!canvas.scene) return;
      this.#stats.scenes.add(canvas.scene.name);
      this.log("🗺️", `Szene gewechselt: <b>${canvas.scene.name}</b>`);
    });
    Hooks.on("createItem", (item) => {
      if (!this.#shouldLog("logItems")) return;
      const actor = item.parent;
      if (!(actor instanceof Actor) || actor.type !== "character") return;
      const lootTypes = ["weapon", "equipment", "consumable", "tool", "loot", "container", "backpack"];
      if (!lootTypes.includes(item.type)) return;
      this.#stats.items.push(`${item.name} (${actor.name})`);
      this.log("🎒", `<b>${actor.name}</b> erhält: ${item.name}`);
    });

    // 📌-Button an Chat-Nachrichten (v13+: HTMLElement, v12: jQuery)
    const addPin = (message, html) => {
      if (!game.user.isGM) return;
      const el = html instanceof HTMLElement ? html : html[0];
      if (!el || el.querySelector(".gmtk-pin")) return;
      const meta = el.querySelector(".message-metadata");
      if (!meta) return;
      const btn = document.createElement("a");
      btn.className = "gmtk-pin";
      btn.dataset.tooltip = "In Session-Chronik merken";
      btn.innerHTML = '<i class="fa-solid fa-thumbtack"></i>';
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.pinMessage(message);
      });
      meta.prepend(btn);
    };
    Hooks.on("renderChatMessageHTML", addPin);
    if (!("renderChatMessageHTML" in Hooks.events)) Hooks.on("renderChatMessage", addPin);
  }

  /* ---------------------------------- Status ---------------------------------- */

  static get active() {
    return game.settings.get(MODULE_ID, "chronicleActive");
  }

  static get isResponsibleGM() {
    return game.user.isGM && (game.users.activeGM?.isSelf ?? true);
  }

  static #shouldLog(settingKey) {
    return this.active && this.isResponsibleGM && game.settings.get(MODULE_ID, settingKey);
  }

  static #resetStats() {
    this.#stats = {
      startTime: null, combats: 0,
      kills: [], fallen: [], items: [],
      crits: [], fumbles: [],
      scenes: new Set()
    };
  }

  /* ---------------------------------- Steuerung ---------------------------------- */

  static async toggle() {
    if (this.active) return this.stop();
    return this.start();
  }

  static async start() {
    if (!game.user.isGM) return;
    const journal = await this.#ensureJournal();
    this.#resetStats();
    this.#stats.startTime = Date.now();
    if (canvas?.scene) this.#stats.scenes.add(canvas.scene.name);
    const now = new Date();
    const dateStr = now.toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const pages = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name: `Session vom ${now.toLocaleDateString("de-DE")}`,
      type: "text",
      text: { content: `<p><em>Session gestartet – ${dateStr}, ${this.#time()}</em></p>` }
    }]);
    await game.settings.set(MODULE_ID, "chroniclePageUuid", pages[0].uuid);
    await game.settings.set(MODULE_ID, "chronicleActive", true);
    ui.notifications.info("Session-Chronik gestartet – Ereignisse werden protokolliert.");
    journal.sheet?.render(true, { pageId: pages[0].id });
  }

  static async stop() {
    if (!game.user.isGM) return;
    this.log("🛑", `<em>Session beendet – ${this.#time()}</em>`);
    this.#buffer.push(this.#summaryHtml());
    await this.flush();
    await game.settings.set(MODULE_ID, "chronicleActive", false);
    ui.notifications.info("Session-Chronik beendet – Zusammenfassung wurde angehängt.");
  }

  /** Zusammenfassungs-Block für das Session-Ende. */
  static #summaryHtml() {
    const s = this.#stats;
    const rows = [];
    if (s.startTime) {
      const mins = Math.round((Date.now() - s.startTime) / 60000);
      rows.push(`<li><b>Dauer:</b> ${Math.floor(mins / 60)} Std. ${mins % 60} Min.</li>`);
    }
    if (s.scenes.size) rows.push(`<li><b>Szenen:</b> ${[...s.scenes].join(", ")}</li>`);
    rows.push(`<li><b>Kämpfe:</b> ${s.combats}</li>`);
    if (s.kills.length) rows.push(`<li><b>Besiegte Gegner:</b> ${s.kills.join(", ")}</li>`);
    if (s.fallen.length) rows.push(`<li><b>Gefallene Helden:</b> ${s.fallen.join(", ")}</li>`);
    if (s.items.length) rows.push(`<li><b>Erhaltene Gegenstände:</b> ${s.items.join(", ")}</li>`);
    if (s.crits.length) rows.push(`<li><b>Natürliche 20:</b> ${s.crits.length} (${s.crits.join(", ")})</li>`);
    if (s.fumbles.length) rows.push(`<li><b>Natürliche 1:</b> ${s.fumbles.length} (${s.fumbles.join(", ")})</li>`);
    return `<hr><h3>Zusammenfassung</h3><ul>${rows.join("")}</ul>`;
  }

  /* ---------------------------------- Merken & Export ---------------------------------- */

  /** 📌: Nachricht manuell in die Chronik übernehmen. */
  static pinMessage(msg) {
    if (!this.active) return ui.notifications.warn("Die Session-Chronik läuft gerade nicht.");
    const speaker = msg.speaker?.alias || msg.author?.name || "Unbekannt";
    const text = this.#plain(msg.content) || (msg.rolls?.length ? `würfelt ${msg.rolls.map(r => `${r.formula} = ${r.total}`).join("; ")}` : "");
    this.log("📌", `<b>${speaker}:</b> ${text}`);
    this.flush();
    ui.notifications.info("In der Chronik gemerkt.");
  }

  /** Exportiert die aktuelle/letzte Session-Seite als Markdown-Datei. */
  static async exportLatest() {
    const uuid = game.settings.get(MODULE_ID, "chroniclePageUuid");
    const page = uuid ? await fromUuid(uuid) : null;
    if (!page) return ui.notifications.warn("Keine Session-Seite gefunden – erst eine Chronik starten.");
    await this.flush();
    const div = document.createElement("div");
    div.innerHTML = page.text?.content ?? "";
    const lines = [`# ${page.name}`, ""];
    for (const el of div.children) {
      const text = el.textContent.trim();
      if (!text) continue;
      if (el.tagName === "H3") lines.push(`## ${text}`, "");
      else if (el.tagName === "UL") {
        for (const li of el.querySelectorAll("li")) lines.push(`- ${li.textContent.trim()}`);
        lines.push("");
      }
      else if (el.tagName === "HR") lines.push("---", "");
      else lines.push(text, "");
    }
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    const filename = `${page.name.replace(/[^\wäöüÄÖÜß-]+/g, "-").toLowerCase()}.md`;
    save(lines.join("\n"), "text/markdown", filename);
    ui.notifications.info(`Chronik exportiert: ${filename}`);
  }

  /* ---------------------------------- Protokollieren ---------------------------------- */

  static log(icon, html) {
    if (!this.active || !this.isResponsibleGM) return;
    this.#buffer.push(`<p><strong>${this.#time()}</strong> ${icon} ${html}</p>`);
    if (this.#buffer.length >= 25) this.flush();
    else this.#flushSoon?.();
  }

  static async flush() {
    if (!this.#buffer.length) return;
    const uuid = game.settings.get(MODULE_ID, "chroniclePageUuid");
    if (!uuid) { this.#buffer = []; return; }
    const page = await fromUuid(uuid);
    if (!page) { this.#buffer = []; return; }
    const chunk = this.#buffer.join("\n");
    this.#buffer = [];
    const current = page.text?.content ?? "";
    await page.update({ "text.content": `${current}\n${chunk}` });
  }

  static #onChatMessage(msg) {
    if (!this.active || !this.isResponsibleGM) return;

    const isWhisper = (msg.whisper?.length ?? 0) > 0;
    if (isWhisper && !game.settings.get(MODULE_ID, "logWhispers")) return;

    const speaker = msg.speaker?.alias || msg.author?.name || "Unbekannt";

    if (msg.isRoll && msg.rolls?.length) {
      // Krit-Statistik (natürliche 20/1 auf W20)
      for (const r of msg.rolls) {
        for (const die of r.dice ?? []) {
          if (die.faces !== 20) continue;
          for (const res of die.results ?? []) {
            if (!res.active) continue;
            if (res.result === 20) this.#stats.crits.push(speaker);
            if (res.result === 1) this.#stats.fumbles.push(speaker);
          }
        }
      }
      if (!game.settings.get(MODULE_ID, "logRolls")) return;
      const parts = msg.rolls.map(r => `${r.formula} = <b>${r.total}</b>`).join("; ");
      const flavor = msg.flavor ? ` <em>(${this.#plain(msg.flavor)})</em>` : "";
      this.log("🎲", `<b>${speaker}</b> würfelt ${parts}${flavor}`);
      return;
    }

    if (!game.settings.get(MODULE_ID, "logChat")) return;
    const text = this.#plain(msg.content);
    if (!text) return;
    const prefix = isWhisper ? "🤫" : "💬";
    this.log(prefix, `<b>${speaker}:</b> ${text}`);
  }

  /* ---------------------------------- Helfer ---------------------------------- */

  static #time() {
    return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  static #plain(html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent.trim();
  }

  static async #ensureJournal() {
    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === FOLDER_NAME);
    folder ??= await Folder.create({ name: FOLDER_NAME, type: "JournalEntry" });
    let journal = game.journal.find(j => j.name === JOURNAL_NAME && j.folder?.id === folder.id);
    journal ??= await JournalEntry.create({
      name: JOURNAL_NAME,
      folder: folder.id,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
    });
    return journal;
  }
}
