/** Loot-Generator: Münzen, Edelsteine und magische Gegenstände nach HG-Band. */

import {
  CR_BANDS, LOOT_TYPES, COINS, HOARD_ITEM_COUNT, RARITY_WEIGHTS, RARITY_LABELS,
  MAGIC_ITEMS, TRINKETS, GEMS, roll, pick, pickWeighted
} from "./data.js";

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LootGenerator extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new LootGenerator();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-loot-generator",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "Loot-Generator", icon: "fa-solid fa-coins" },
    position: { width: 520, height: "auto" },
    actions: {
      generate: LootGenerator.#onGenerate,
      toChat: LootGenerator.#onToChat,
      saveJournal: LootGenerator.#onSaveJournal
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/loot-generator.hbs` }
  };

  loot = null;
  enrichedItems = null;
  opts = { band: "0-4", type: "individual" };

  async _prepareContext() {
    return {
      bands: CR_BANDS,
      types: LOOT_TYPES,
      opts: this.opts,
      loot: this.loot,
      enrichedItems: this.enrichedItems
    };
  }

  #readOptions() {
    for (const key of ["band", "type"]) {
      const el = this.element.querySelector(`[name="${key}"]`);
      if (el) this.opts[key] = el.value;
    }
  }

  /* ---------------------------------- Erzeugung ---------------------------------- */

  static generateLoot({ band = "0-4", type = "individual" } = {}) {
    const coins = COINS[type][band]();
    const loot = { band, bandLabel: CR_BANDS[band], type, typeLabel: LOOT_TYPES[type], coins, gems: [], items: [], trinket: null };

    if (type === "hoard") {
      // Edelsteine
      const gemCount = roll(1, 4);
      const gemValueByBand = { "0-4": 10, "5-10": 50, "11-16": 500, "17+": 1000 };
      for (let i = 0; i < gemCount; i++) {
        loot.gems.push(`${pick(GEMS)} (${gemValueByBand[band]} GM)`);
      }
      // Magische Gegenstände
      const [min, max] = HOARD_ITEM_COUNT[band];
      const count = min + Math.floor(Math.random() * (max - min + 1));
      const seen = new Set();
      for (let i = 0; i < count; i++) {
        const rarity = pickWeighted(RARITY_WEIGHTS[band]);
        let name = pick(MAGIC_ITEMS[rarity]);
        let guard = 0;
        while (seen.has(name) && guard++ < 10) name = pick(MAGIC_ITEMS[rarity]);
        seen.add(name);
        loot.items.push({ name, rarity: RARITY_LABELS[rarity] });
      }
      // Kuriosität
      if (Math.random() < 0.5) loot.trinket = pick(TRINKETS);
    } else if (Math.random() < 0.15) {
      // Einzelne Gegner tragen selten etwas Interessantes
      loot.trinket = pick(TRINKETS);
    }
    return loot;
  }

  /** Sucht den Gegenstand in Welt-Items und Item-Kompendien und liefert ggf. einen @UUID-Link. */
  static async linkifyItem(name) {
    const clean = name.replace(/\s*\(.*\)$/, "").toLowerCase();
    const world = game.items.find(i => i.name.toLowerCase() === clean);
    if (world) return `@UUID[${world.uuid}]{${name}}`;
    for (const pack of game.packs.filter(p => p.documentName === "Item")) {
      try {
        const entry = pack.index.find(e => e.name?.toLowerCase() === clean);
        if (entry) return `@UUID[Compendium.${pack.collection}.Item.${entry._id}]{${name}}`;
      } catch (err) { /* Pack ohne Index – ignorieren */ }
    }
    return name;
  }

  async #buildHtml({ links = true } = {}) {
    const l = this.loot;
    const coinStr = Object.entries(l.coins)
      .map(([k, v]) => `${v.toLocaleString("de-DE")} ${{ kp: "KM", sp: "SM", gm: "GM", pm: "PM" }[k]}`)
      .join(", ");
    let html = `<p><b>Art:</b> ${l.typeLabel} · <b>${l.bandLabel}</b></p><p><b>Münzen:</b> ${coinStr}</p>`;
    if (l.gems.length) html += `<p><b>Edelsteine:</b> ${l.gems.join(", ")}</p>`;
    if (l.items.length) {
      const rows = [];
      for (const item of l.items) {
        const label = links ? await LootGenerator.linkifyItem(item.name) : item.name;
        rows.push(`<li>${label} <em>(${item.rarity})</em></li>`);
      }
      html += `<p><b>Magische Gegenstände:</b></p><ul>${rows.join("")}</ul>`;
    }
    if (l.trinket) html += `<p><b>Kuriosität:</b> ${l.trinket}</p>`;
    return html;
  }

  static async #onGenerate() {
    this.#readOptions();
    this.loot = LootGenerator.generateLoot(this.opts);
    // Für die Fenster-Anzeige: Links auflösen und anreichern
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const raw = await this.#buildHtml({ links: true });
    this.enrichedItems = await TE.enrichHTML(raw);
    this.render();
  }

  static async #onToChat() {
    if (!this.loot) return ui.notifications.warn("Erst Loot generieren.");
    await ChatMessage.create({
      content: `<h3>Beute</h3>${await this.#buildHtml()}`,
      whisper: [game.user.id]
    });
  }

  static async #onSaveJournal() {
    if (!this.loot) return ui.notifications.warn("Erst Loot generieren.");
    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === "GM Toolkit");
    folder ??= await Folder.create({ name: "GM Toolkit", type: "JournalEntry" });
    const name = `Beute (${this.loot.typeLabel}, ${this.loot.bandLabel}) – ${new Date().toLocaleDateString("de-DE")}`;
    const entry = await JournalEntry.create({
      name,
      folder: folder.id,
      pages: [{ name: "Beute", type: "text", text: { content: await this.#buildHtml() } }]
    });
    ui.notifications.info("Beute als Journal gespeichert.");
    entry.sheet.render(true);
  }
}
