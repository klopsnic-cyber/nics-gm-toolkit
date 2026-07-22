/** Händler-Generator: erzeugt Läden mit Inventar und Preisen aus den
 *  dnd5e-Item-Kompendien, inklusive generiertem Händler-NSC und Feilschen. */

import { generateNpc } from "./npc-generator.js";
import { pickWeighted } from "./data.js";

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SHOP_TYPES = {
  gemischt: "Gemischtwaren",
  waffen: "Waffenschmied",
  ruestung: "Rüstungsschmied",
  alchemist: "Alchemist/Tränke",
  magie: "Magische Kuriositäten"
};

const WEALTH = {
  arm: "Ärmlich",
  normal: "Solide",
  reich: "Wohlhabend"
};

const WEALTH_CONFIG = {
  arm:    { factor: 0.9,  rarities: { common: 85, uncommon: 15 }, items: [6, 10] },
  normal: { factor: 1.0,  rarities: { common: 60, uncommon: 30, rare: 10 }, items: [10, 16] },
  reich:  { factor: 1.2,  rarities: { common: 35, uncommon: 35, rare: 22, veryRare: 8 }, items: [14, 22] }
};

/** Filter je Ladentyp: dnd5e Item-Typen und optionale Namens-/Eigenschaftsfilter */
const TYPE_FILTERS = {
  gemischt: (e) => ["equipment", "consumable", "tool", "loot", "weapon"].includes(e.type),
  waffen: (e) => e.type === "weapon",
  ruestung: (e) => e.type === "equipment",
  alchemist: (e) => e.type === "consumable",
  magie: (e) => (e.rarity && e.rarity !== "common")
};

const DENOM_DE = { pp: "PM", gp: "GM", ep: "EM", sp: "SM", cp: "KM" };
const RARITY_DE = { common: "Gewöhnlich", uncommon: "Ungewöhnlich", rare: "Selten", veryRare: "Sehr selten", legendary: "Legendär", artifact: "Artefakt" };

export class ShopGenerator extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;
  static #itemCache = null;

  static open() {
    this.#instance ??= new ShopGenerator();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-shop-generator",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "Händler-Generator", icon: "fa-solid fa-shop" },
    position: { width: 600, height: "auto" },
    actions: {
      generate: ShopGenerator.#onGenerate,
      haggle: ShopGenerator.#onHaggle,
      saveJournal: ShopGenerator.#onSaveJournal,
      toChat: ShopGenerator.#onToChat
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/shop-generator.hbs`,
      scrollable: [".gmtk-shop-list"]
    }
  };

  shop = null;
  opts = { type: "gemischt", wealth: "normal" };

  async _prepareContext() {
    return { shopTypes: SHOP_TYPES, wealth: WEALTH, opts: this.opts, shop: this.shop };
  }

  #readOptions() {
    this.opts.type = this.element.querySelector('[name="type"]')?.value ?? "gemischt";
    this.opts.wealth = this.element.querySelector('[name="wealth"]')?.value ?? "normal";
  }

  /* ---------------------------------- Item-Pool ---------------------------------- */

  static async loadItems() {
    if (this.#itemCache) return this.#itemCache;
    const items = [];
    for (const pack of game.packs.filter(p => p.documentName === "Item")) {
      try {
        const index = await pack.getIndex({ fields: ["type", "system.price", "system.rarity"] });
        for (const e of index) {
          const price = e.system?.price;
          const value = typeof price === "object" ? Number(price?.value) : Number(price);
          if (!Number.isFinite(value) || value <= 0) continue;
          items.push({
            name: e.name,
            uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`,
            type: e.type,
            rarity: e.system?.rarity || "common",
            value,
            denomination: (typeof price === "object" ? price?.denomination : "gp") || "gp"
          });
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | Item-Kompendium ${pack.collection} übersprungen`, err);
      }
    }
    this.#itemCache = items;
    return items;
  }

  /* ---------------------------------- Erzeugung ---------------------------------- */

  static async buildShop({ type, wealth }) {
    const all = await this.loadItems();
    if (!all.length) return { error: "Keine Gegenstände mit Preisen in den Kompendien gefunden." };

    const cfg = WEALTH_CONFIG[wealth];
    const pool = all.filter(TYPE_FILTERS[type]);
    if (!pool.length) return { error: "Keine passenden Waren für diesen Ladentyp gefunden." };

    const byRarity = {};
    for (const item of pool) (byRarity[item.rarity] ??= []).push(item);

    const [min, max] = cfg.items;
    const count = min + Math.floor(Math.random() * (max - min + 1));
    const chosen = new Map();
    for (let i = 0; i < count * 3 && chosen.size < count; i++) {
      const available = Object.fromEntries(Object.entries(cfg.rarities).filter(([r]) => byRarity[r]?.length));
      if (!Object.keys(available).length) break;
      const rarity = pickWeighted(available);
      const list = byRarity[rarity];
      const item = list[Math.floor(Math.random() * list.length)];
      if (!chosen.has(item.uuid)) chosen.set(item.uuid, item);
    }
    if (!chosen.size) return { error: "Sortiment konnte nicht gefüllt werden." };

    // Händler-NSC dazu
    const npc = generateNpc({ role: "haendler" });

    const inventory = [...chosen.values()].map(item => {
      const wobble = 0.85 + Math.random() * 0.3; // ±15 %
      const price = Math.max(1, Math.round(item.value * cfg.factor * wobble));
      return {
        ...item,
        basePrice: price,
        price,
        priceLabel: `${price} ${DENOM_DE[item.denomination] ?? item.denomination}`,
        rarityLabel: RARITY_DE[item.rarity] ?? item.rarity
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "de"));

    return {
      typeLabel: SHOP_TYPES[type],
      wealthLabel: WEALTH[wealth],
      npc,
      merchantLine: `${npc.name} – ${npc.voice}; ${npc.personality}`,
      inventory,
      haggle: null
    };
  }

  static async #onGenerate() {
    this.#readOptions();
    this.shop = { loading: true };
    this.render();
    this.shop = await ShopGenerator.buildShop(this.opts);
    this.render();
  }

  /** Feilschen: W20 – ab 15 gibt es 10 % Rabatt, bei 20 sogar 20 %, bei 1–5 wird es teurer. */
  static async #onHaggle() {
    if (!this.shop?.inventory) return;
    const roll = await new Roll("1d20").evaluate();
    let factor = 1, note;
    if (roll.total === 20) { factor = 0.8; note = "Meisterhaft gefeilscht – 20 % Rabatt!"; }
    else if (roll.total >= 15) { factor = 0.9; note = "Gut verhandelt – 10 % Rabatt."; }
    else if (roll.total <= 5) { factor = 1.1; note = "Beleidigt den Händler – 10 % Aufschlag."; }
    else { note = "Der Händler bleibt beim Preis."; }
    for (const item of this.shop.inventory) {
      item.price = Math.max(1, Math.round(item.basePrice * factor));
      item.priceLabel = `${item.price} ${DENOM_DE[item.denomination] ?? item.denomination}`;
    }
    this.shop.haggle = `🎲 ${roll.total}: ${note}`;
    this.render();
  }

  #shopHtml() {
    const s = this.shop;
    const rows = s.inventory.map(i =>
      `<tr><td>@UUID[${i.uuid}]{${i.name}}</td><td>${i.rarityLabel}</td><td style="text-align:right">${i.priceLabel}</td></tr>`).join("");
    return `
      <p><b>${s.typeLabel}</b> (${s.wealthLabel})</p>
      <p><b>Inhaber:</b> ${s.merchantLine}</p>
      <table><thead><tr><th>Ware</th><th>Seltenheit</th><th style="text-align:right">Preis</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  static async #onSaveJournal() {
    if (!this.shop?.inventory) return;
    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === "GM Toolkit");
    folder ??= await Folder.create({ name: "GM Toolkit", type: "JournalEntry" });
    const name = `${this.shop.typeLabel} von ${this.shop.npc.name}`;
    const entry = await JournalEntry.create({
      name,
      folder: folder.id,
      pages: [{ name, type: "text", text: { content: this.#shopHtml() } }]
    });
    ui.notifications.info(`Laden „${name}" als Journal gespeichert.`);
    entry.sheet.render(true);
  }

  static async #onToChat() {
    if (!this.shop?.inventory) return;
    await ChatMessage.create({
      content: `<h3><i class="fa-solid fa-shop"></i> ${this.shop.typeLabel}</h3>${this.#shopHtml()}`,
      whisper: [game.user.id]
    });
  }
}
