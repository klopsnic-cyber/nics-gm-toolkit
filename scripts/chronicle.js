/** Session-Chronik: protokolliert Chat, Würfe, Kämpfe und Szenenwechsel in ein Journal. */

const MODULE_ID = "nics-gm-toolkit";
const FOLDER_NAME = "GM Toolkit";
const JOURNAL_NAME = "Session-Chronik";

export class Chronicle {

  static #buffer = [];
  static #flushSoon = null;

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
  }

  static init() {
    this.#flushSoon = foundry.utils.debounce(() => this.flush(), 8000);

    Hooks.on("createChatMessage", (msg) => this.#onChatMessage(msg));
    Hooks.on("combatStart", (combat) => {
      if (!this.#shouldLog("logCombat")) return;
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
    Hooks.on("canvasReady", (canvas) => {
      if (!this.#shouldLog("logScenes")) return;
      if (canvas.scene) this.log("🗺️", `Szene gewechselt: <b>${canvas.scene.name}</b>`);
    });
  }

  /* ---------------------------------- Status ---------------------------------- */

  static get active() {
    return game.settings.get(MODULE_ID, "chronicleActive");
  }

  /** Nur genau ein GM (der aktive) schreibt, um Duplikate zu vermeiden. */
  static get isResponsibleGM() {
    return game.user.isGM && (game.users.activeGM?.isSelf ?? true);
  }

  static #shouldLog(settingKey) {
    return this.active && this.isResponsibleGM && game.settings.get(MODULE_ID, settingKey);
  }

  /* ---------------------------------- Steuerung ---------------------------------- */

  static async toggle() {
    if (this.active) return this.stop();
    return this.start();
  }

  static async start() {
    if (!game.user.isGM) return;
    const journal = await this.#ensureJournal();
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
    await this.flush();
    await game.settings.set(MODULE_ID, "chronicleActive", false);
    ui.notifications.info("Session-Chronik beendet.");
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

    // Würfelwürfe
    if (msg.isRoll && msg.rolls?.length) {
      if (!game.settings.get(MODULE_ID, "logRolls")) return;
      const parts = msg.rolls.map(r => `${r.formula} = <b>${r.total}</b>`).join("; ");
      const flavor = msg.flavor ? ` <em>(${this.#plain(msg.flavor)})</em>` : "";
      this.log("🎲", `<b>${speaker}</b> würfelt ${parts}${flavor}`);
      return;
    }

    // Normale Nachrichten
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
