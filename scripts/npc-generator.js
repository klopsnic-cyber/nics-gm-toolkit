/** NPC-Generator: erzeugt Zufalls-NSCs mit Klasse, Stufe und Zaubern
 *  und legt sie als Journal oder dnd5e-Actor an. */

import {
  RACES, GENDERS, ROLES, FIRST_NAMES, LAST_NAMES,
  APPEARANCES, PERSONALITIES, VOICES, MOTIVATIONS, SECRETS, QUIRKS,
  CLASS_CHOICES, LEVEL_CHOICES, CLASS_INFO, ROLE_CLASS_WEIGHTS, SPELLS,
  HOOKS, POCKET_ITEMS, pick, pickWeighted, roll
} from "./data.js";

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcGenerator extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new NpcGenerator();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-npc-generator",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "NPC-Generator", icon: "fa-solid fa-user-plus" },
    position: { width: 560, height: "auto" },
    actions: {
      generate: NpcGenerator.#onGenerate,
      saveJournal: NpcGenerator.#onSaveJournal,
      createActor: NpcGenerator.#onCreateActor,
      toChat: NpcGenerator.#onToChat
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/npc-generator.hbs` }
  };

  npc = null;
  opts = { race: "zufall", gender: "zufall", role: "zufall", klass: "passend", level: "zufall" };

  async _prepareContext() {
    return {
      races: RACES,
      genders: GENDERS,
      roles: ROLES,
      classChoices: CLASS_CHOICES,
      levelChoices: LEVEL_CHOICES,
      opts: this.opts,
      npc: this.npc
    };
  }

  #readOptions() {
    for (const key of ["race", "gender", "role", "klass", "level"]) {
      const el = this.element.querySelector(`[name="${key}"]`);
      if (el) this.opts[key] = el.value;
    }
  }

  /* ---------------------------------- Erzeugung ---------------------------------- */

  static #rollLevel(choice) {
    if (choice === "1-4") return 1 + Math.floor(Math.random() * 4);
    if (choice === "5-8") return 5 + Math.floor(Math.random() * 4);
    if (choice === "9-12") return 9 + Math.floor(Math.random() * 4);
    // Zufällig: niedrige Stufen häufiger
    return pickWeighted({ 1: 20, 2: 16, 3: 14, 4: 12, 5: 10, 6: 8, 7: 6, 8: 5, 9: 4, 10: 2, 11: 2, 12: 1 });
  }

  static #pickClass(choice, role) {
    if (choice === "zufall") {
      const keys = Object.keys(CLASS_INFO).filter(k => k !== "kein");
      return pick(keys);
    }
    if (choice === "passend") {
      const weights = ROLE_CLASS_WEIGHTS[role] ?? { kein: 70, kaempfer: 15, schurke: 15 };
      return pickWeighted(weights);
    }
    return choice; // konkrete Klasse oder "kein"
  }

  static #pickSpells(klass, level) {
    const info = CLASS_INFO[klass];
    const list = SPELLS[klass];
    if (!list || info.caster === "none") return null;
    if (info.caster === "half" && level < 2) return null;

    const result = [];
    const pickSome = (arr, n) => {
      const pool = [...arr];
      const out = [];
      while (out.length < n && pool.length) {
        out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }
      return out;
    };

    // Zaubertricks
    if (list.tricks?.length) {
      const n = Math.min(2 + Math.floor(level / 4), list.tricks.length);
      result.push({ grade: "Zaubertricks", spells: pickSome(list.tricks, n) });
    }

    // Höchster Zaubergrad
    const maxGrade = info.caster === "full"
      ? Math.min(Math.ceil(level / 2), 5)
      : Math.min(Math.ceil(level / 4), 3);

    for (let grade = 1; grade <= maxGrade; grade++) {
      const pool = list[grade];
      if (!pool?.length) continue;
      const n = grade === maxGrade ? (1 + Math.floor(Math.random() * 2)) : 2;
      result.push({ grade: `Grad ${grade}`, spells: pickSome(pool, Math.min(n, pool.length)) });
    }
    return result;
  }

  static generateNpc({ race = "zufall", gender = "zufall", role = "zufall", klass = "passend", level = "zufall" } = {}) {
    const raceKeys = Object.keys(RACES).filter(k => k !== "zufall");
    const roleKeys = Object.keys(ROLES).filter(k => k !== "zufall");
    const r = race === "zufall" ? pick(raceKeys) : race;
    const g = gender === "zufall" ? pick(["m", "w"]) : gender;
    const ro = role === "zufall" ? pick(roleKeys) : role;

    const cls = this.#pickClass(klass, ro);
    const info = CLASS_INFO[cls];
    const lvl = cls === "kein" ? 0 : this.#rollLevel(level);

    const first = pick(FIRST_NAMES[r][g]);
    const lastRaw = pick(LAST_NAMES[r]);
    const last = lastRaw.startsWith("(") ? "" : lastRaw;

    // Kampfwerte (grobe Richtwerte für den Spielleiter)
    const hp = cls === "kein" ? 3 + roll(1, 6) : lvl * info.hd + lvl;
    const ac = info.ac + (lvl >= 9 ? 1 : 0);
    const mainVal = cls === "kein" ? 10 : Math.min(14 + Math.floor(lvl / 4), 20);

    // Taschen
    const coins = roll(2, 6) * (cls === "kein" ? 1 : Math.max(1, Math.floor(lvl / 2)));
    const pockets = [pick(POCKET_ITEMS)];
    if (Math.random() < 0.5) {
      let second = pick(POCKET_ITEMS);
      if (second !== pockets[0]) pockets.push(second);
    }

    return {
      name: [first, last].filter(Boolean).join(" "),
      race: r, raceLabel: RACES[r],
      gender: g, genderLabel: GENDERS[g],
      role: ro, roleLabel: ROLES[ro],
      age: 16 + roll(2, 30),
      klass: cls,
      classLabel: info.label,
      level: lvl,
      classLine: cls === "kein" ? info.label : `${info.label} Stufe ${lvl}`,
      hp, ac,
      mainStat: info.main,
      mainVal,
      statLine: cls === "kein"
        ? `TP ${hp} · RK ${ac}`
        : `TP ${hp} · RK ${ac} · ${info.main} ${mainVal}`,
      spells: this.#pickSpells(cls, lvl),
      appearance: pick(APPEARANCES),
      personality: pick(PERSONALITIES),
      voice: pick(VOICES),
      motivation: pick(MOTIVATIONS),
      secret: pick(SECRETS),
      quirk: pick(QUIRKS),
      hook: pick(HOOKS),
      pockets: `${coins} GM, ${pockets.join(", ")}`
    };
  }

  static #onGenerate() {
    this.#readOptions();
    this.npc = NpcGenerator.generateNpc(this.opts);
    this.render();
  }

  /* ---------------------------------- Ausgabe ---------------------------------- */

  #npcHtml() {
    const n = this.npc;
    let spellHtml = "";
    if (n.spells?.length) {
      const rows = n.spells.map(s => `<li><b>${s.grade}:</b> ${s.spells.join(", ")}</li>`).join("");
      spellHtml = `<p><b>Zauber:</b></p><ul>${rows}</ul>`;
    }
    return `
      <p><b>Volk:</b> ${n.raceLabel} · <b>Geschlecht:</b> ${n.genderLabel} · <b>Alter:</b> ${n.age} · <b>Beruf:</b> ${n.roleLabel}</p>
      <p><b>Klasse:</b> ${n.classLine} · <b>Werte:</b> ${n.statLine}</p>
      <p><b>Aussehen:</b> ${n.appearance}</p>
      <p><b>Persönlichkeit:</b> ${n.personality}</p>
      <p><b>Stimme:</b> ${n.voice}</p>
      <p><b>Marotte:</b> ${n.quirk}</p>
      <p><b>Motivation:</b> ${n.motivation}</p>
      <p><b>In den Taschen:</b> ${n.pockets}</p>
      ${spellHtml}
      <section class="secret" id="secret-${foundry.utils.randomID()}">
        <p><b>Geheimnis:</b> ${n.secret}</p>
        <p><b>Aufhänger:</b> ${n.hook}</p>
      </section>`;
  }

  static async #onSaveJournal() {
    if (!this.npc) return ui.notifications.warn("Erst einen NSC generieren.");
    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === "GM Toolkit");
    folder ??= await Folder.create({ name: "GM Toolkit", type: "JournalEntry" });
    const entry = await JournalEntry.create({
      name: this.npc.name,
      folder: folder.id,
      pages: [{ name: this.npc.name, type: "text", text: { content: this.#npcHtml() } }]
    });
    ui.notifications.info(`Journal „${this.npc.name}" angelegt.`);
    entry.sheet.render(true);
  }

  static async #onCreateActor() {
    if (!this.npc) return ui.notifications.warn("Erst einen NSC generieren.");
    try {
      const actor = await Actor.create({
        name: this.npc.name,
        type: "npc",
        img: "icons/svg/mystery-man.svg",
        system: {
          details: { biography: { value: this.#npcHtml() } },
          attributes: { hp: { value: this.npc.hp, max: this.npc.hp } }
        }
      });
      ui.notifications.info(`Actor „${this.npc.name}" angelegt.`);
      actor.sheet.render(true);
    } catch (err) {
      console.error(`${MODULE_ID} | Actor-Erstellung fehlgeschlagen`, err);
      ui.notifications.error("Actor konnte nicht angelegt werden – läuft das dnd5e-System?");
    }
  }

  static async #onToChat() {
    if (!this.npc) return ui.notifications.warn("Erst einen NSC generieren.");
    await ChatMessage.create({
      content: `<h3>${this.npc.name}</h3>${this.#npcHtml()}`,
      whisper: [game.user.id]
    });
  }
}
