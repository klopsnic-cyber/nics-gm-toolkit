/** Begegnungs-Generator: Zufallsbegegnungen nach Gruppenstufe, Schwierigkeit
 *  und Gelände. Zieht Monster aus den installierten Actor-Kompendien (dnd5e). */

import { pick, pickWeighted } from "./data.js";

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** XP-Schwellen pro Charakterstufe: [leicht, mittel, schwer, tödlich] (DMG) */
const THRESHOLDS = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400],
  4: [125, 250, 375, 500], 5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100], 9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200], 17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700]
};

/** HG → XP */
const CR_XP = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100,
  5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400,
  13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000,
  20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000,
  27: 105000, 28: 120000, 29: 135000, 30: 155000
};

const DIFFICULTIES = { leicht: "Leicht", mittel: "Mittel", schwer: "Schwer", toedlich: "Tödlich" };
const DIFF_INDEX = { leicht: 0, mittel: 1, schwer: 2, toedlich: 3 };

const TERRAINS = {
  egal: "Beliebig",
  wald: "Wald", ebene: "Ebene/Grasland", berge: "Berge", sumpf: "Sumpf",
  kueste: "Küste/Wasser", wueste: "Wüste", stadt: "Stadt/Dorf",
  dungeon: "Dungeon/Ruine", unterreich: "Unterreich", arktis: "Eis/Arktis"
};

/** Kreaturtyp-Gewichte je Gelände (dnd5e system.details.type.value) */
const TERRAIN_TYPES = {
  wald: { beast: 5, fey: 4, plant: 4, humanoid: 2, monstrosity: 2, giant: 1 },
  ebene: { beast: 5, humanoid: 3, monstrosity: 2, giant: 1, dragon: 1 },
  berge: { giant: 4, dragon: 3, monstrosity: 3, beast: 2, elemental: 2, humanoid: 2 },
  sumpf: { undead: 4, plant: 3, beast: 3, monstrosity: 2, dragon: 1, humanoid: 1 },
  kueste: { beast: 4, monstrosity: 3, elemental: 2, humanoid: 2, dragon: 1 },
  wueste: { beast: 3, monstrosity: 3, elemental: 3, undead: 2, humanoid: 2 },
  stadt: { humanoid: 6, beast: 1, undead: 1, fiend: 1 },
  dungeon: { undead: 4, construct: 3, aberration: 3, fiend: 2, monstrosity: 2, humanoid: 2, ooze: 2 },
  unterreich: { aberration: 4, monstrosity: 3, undead: 2, ooze: 2, elemental: 1, fiend: 1 },
  arktis: { beast: 3, giant: 3, monstrosity: 2, elemental: 2, undead: 1 }
};

function multiplier(count) {
  if (count <= 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  if (count <= 14) return 3;
  return 4;
}

export class EncounterGenerator extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;
  static #monsterCache = null;

  static open() {
    this.#instance ??= new EncounterGenerator();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-encounter-generator",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "Begegnungs-Generator", icon: "fa-solid fa-dragon" },
    position: { width: 560, height: "auto" },
    actions: {
      generate: EncounterGenerator.#onGenerate,
      toChat: EncounterGenerator.#onToChat,
      placeTokens: EncounterGenerator.#onPlaceTokens
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/encounter-generator.hbs` }
  };

  encounter = null;
  opts = { size: 4, level: 3, difficulty: "mittel", terrain: "egal" };

  async _prepareContext() {
    return {
      difficulties: DIFFICULTIES,
      terrains: TERRAINS,
      opts: this.opts,
      encounter: this.encounter
    };
  }

  #readOptions() {
    const num = (name, def) => {
      const v = parseInt(this.element.querySelector(`[name="${name}"]`)?.value, 10);
      return Number.isFinite(v) ? Math.max(1, v) : def;
    };
    this.opts.size = Math.min(num("size", 4), 10);
    this.opts.level = Math.min(num("level", 3), 20);
    this.opts.difficulty = this.element.querySelector('[name="difficulty"]')?.value ?? "mittel";
    this.opts.terrain = this.element.querySelector('[name="terrain"]')?.value ?? "egal";
  }

  /* ---------------------------------- Monster-Pool ---------------------------------- */

  /** Indiziert alle Actor-Kompendien mit HG-Daten (einmalig, dann Cache). */
  static async loadMonsters() {
    if (this.#monsterCache) return this.#monsterCache;
    const monsters = [];
    for (const pack of game.packs.filter(p => p.documentName === "Actor")) {
      try {
        const index = await pack.getIndex({ fields: ["type", "system.details.cr", "system.details.type"] });
        for (const e of index) {
          if (e.type !== "npc") continue;
          const cr = e.system?.details?.cr;
          if (cr === undefined || cr === null) continue;
          const crNum = typeof cr === "object" ? Number(cr.value ?? cr) : Number(cr);
          if (!Number.isFinite(crNum)) continue;
          const xp = CR_XP[crNum];
          if (!xp) continue;
          const typeRaw = e.system?.details?.type;
          const ctype = (typeof typeRaw === "object" ? typeRaw?.value : typeRaw) ?? "";
          monsters.push({ name: e.name, uuid: e.uuid ?? `Compendium.${pack.collection}.Actor.${e._id}`, cr: crNum, xp, ctype, pack: pack.collection, id: e._id });
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | Kompendium ${pack.collection} konnte nicht indiziert werden`, err);
      }
    }
    this.#monsterCache = monsters;
    return monsters;
  }

  /* ---------------------------------- Erzeugung ---------------------------------- */

  static async buildEncounter({ size, level, difficulty, terrain }) {
    const monsters = await this.loadMonsters();
    if (!monsters.length) return { error: "Keine Monster mit HG-Werten in den Kompendien gefunden. Installiere z. B. das dnd5e-SRD-Monster-Kompendium." };

    const budget = THRESHOLDS[level][DIFF_INDEX[difficulty]] * size;
    const typeWeights = TERRAIN_TYPES[terrain] ?? null;

    const weightOf = (m) => {
      if (!typeWeights) return 1;
      return typeWeights[m.ctype] ?? 0.3; // fremde Typen selten, aber nicht unmöglich
    };
    const pool = monsters.filter(m => m.xp <= budget && m.xp >= budget / 40);
    if (!pool.length) return { error: "Kein passendes Monster im HG-Bereich gefunden." };

    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const groups = [];
      let raw = 0;
      let count = 0;
      const maxGroups = 1 + Math.floor(Math.random() * 3);
      for (let gi = 0; gi < maxGroups; gi++) {
        // gewichteter Zufallszug
        const weights = {};
        pool.forEach((m, i) => { weights[i] = weightOf(m) * 100; });
        const m = pool[Number(pickWeighted(weights))];
        if (!m) break;
        const maxN = Math.max(1, Math.floor((budget - raw) / m.xp));
        if (maxN < 1) continue;
        const n = 1 + Math.floor(Math.random() * Math.min(maxN, gi === 0 ? 4 : 6));
        if (groups.some(g => g.name === m.name)) continue;
        groups.push({ ...m, count: n });
        raw += m.xp * n;
        count += n;
      }
      if (!groups.length) continue;
      const adjusted = Math.round(raw * multiplier(count));
      const score = Math.abs(adjusted - budget);
      if (adjusted <= budget * 1.25 && (!best || score < best.score)) {
        best = { groups, raw, adjusted, count, score };
      }
      if (best && best.score < budget * 0.1) break;
    }
    if (!best) return { error: "Konnte keine passende Begegnung bauen – versuch eine andere Schwierigkeit." };

    return {
      budget,
      raw: best.raw,
      adjusted: best.adjusted,
      count: best.count,
      groups: best.groups.map(g => ({ ...g, crLabel: g.cr < 1 ? `1/${Math.round(1 / g.cr)}` : String(g.cr), xpTotal: g.xp * g.count })),
      diffLabel: DIFFICULTIES[difficulty],
      terrainLabel: TERRAINS[terrain]
    };
  }

  static async #onGenerate() {
    this.#readOptions();
    this.encounter = { loading: true };
    this.render();
    this.encounter = await EncounterGenerator.buildEncounter(this.opts);
    this.render();
  }

  #encounterHtml() {
    const e = this.encounter;
    const rows = e.groups.map(g =>
      `<li>${g.count}× @UUID[${g.uuid}]{${g.name}} (HG ${g.crLabel}, je ${g.xp} XP)</li>`).join("");
    return `<p><b>${e.diffLabel}</b> · ${e.terrainLabel} · Budget ${e.budget} XP → angepasst ${e.adjusted} XP</p><ul>${rows}</ul>`;
  }

  static async #onToChat() {
    if (!this.encounter?.groups) return;
    await ChatMessage.create({
      content: `<h3><i class="fa-solid fa-dragon"></i> Begegnung</h3>${this.#encounterHtml()}`,
      whisper: [game.user.id]
    });
  }

  /** Importiert die Monster (falls nötig) und stellt Tokens in die Szenenmitte. */
  static async #onPlaceTokens() {
    const e = this.encounter;
    if (!e?.groups) return;
    if (!canvas?.scene) return ui.notifications.warn("Keine aktive Szene.");

    let folder = game.folders.find(f => f.type === "Actor" && f.name === "GM Toolkit");
    folder ??= await Folder.create({ name: "GM Toolkit", type: "Actor" });

    const gs = canvas.scene.grid.size;
    const cx = Math.floor(canvas.scene.width / 2 / gs) * gs;
    const cy = Math.floor(canvas.scene.height / 2 / gs) * gs;
    const tokens = [];
    let i = 0;

    for (const g of e.groups) {
      let actor = game.actors.find(a => a.name === g.name);
      if (!actor) {
        const src = await fromUuid(g.uuid);
        if (!src) { ui.notifications.warn(`${g.name} nicht gefunden.`); continue; }
        const data = src.toObject();
        data.folder = folder.id;
        actor = await Actor.create(data);
      }
      for (let n = 0; n < g.count; n++) {
        const td = await actor.getTokenDocument({
          x: cx + (i % 6) * gs,
          y: cy + Math.floor(i / 6) * gs,
          hidden: true
        });
        tokens.push(td.toObject());
        i++;
      }
    }
    if (tokens.length) {
      await canvas.scene.createEmbeddedDocuments("Token", tokens);
      ui.notifications.info(`${tokens.length} Token(s) versteckt in der Szenenmitte platziert.`);
    }
  }
}
