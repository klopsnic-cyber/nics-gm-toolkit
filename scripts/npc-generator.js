/** NPC-Generator: erzeugt Zufalls-NSCs und legt sie als Journal oder dnd5e-Actor an. */

import {
  RACES, GENDERS, ROLES, FIRST_NAMES, LAST_NAMES,
  APPEARANCES, PERSONALITIES, VOICES, MOTIVATIONS, SECRETS, QUIRKS, pick, roll
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
    position: { width: 520, height: "auto" },
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
  opts = { race: "zufall", gender: "zufall", role: "zufall" };

  async _prepareContext() {
    return {
      races: RACES,
      genders: GENDERS,
      roles: ROLES,
      opts: this.opts,
      npc: this.npc
    };
  }

  #readOptions() {
    for (const key of ["race", "gender", "role"]) {
      const el = this.element.querySelector(`[name="${key}"]`);
      if (el) this.opts[key] = el.value;
    }
  }

  /* ---------------------------------- Erzeugung ---------------------------------- */

  static generateNpc({ race = "zufall", gender = "zufall", role = "zufall" } = {}) {
    const raceKeys = Object.keys(RACES).filter(k => k !== "zufall");
    const roleKeys = Object.keys(ROLES).filter(k => k !== "zufall");
    const r = race === "zufall" ? pick(raceKeys) : race;
    const g = gender === "zufall" ? pick(["m", "w"]) : gender;
    const ro = role === "zufall" ? pick(roleKeys) : role;

    const first = pick(FIRST_NAMES[r][g]);
    const lastRaw = pick(LAST_NAMES[r]);
    const last = lastRaw.startsWith("(") ? "" : lastRaw;

    return {
      name: [first, last].filter(Boolean).join(" "),
      race: r,
      raceLabel: RACES[r],
      gender: g,
      genderLabel: GENDERS[g],
      role: ro,
      roleLabel: ROLES[ro],
      age: 16 + roll(2, 30),
      appearance: pick(APPEARANCES),
      personality: pick(PERSONALITIES),
      voice: pick(VOICES),
      motivation: pick(MOTIVATIONS),
      secret: pick(SECRETS),
      quirk: pick(QUIRKS)
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
    return `
      <p><b>Volk:</b> ${n.raceLabel} · <b>Geschlecht:</b> ${n.genderLabel} · <b>Alter:</b> ${n.age} · <b>Rolle:</b> ${n.roleLabel}</p>
      <p><b>Aussehen:</b> ${n.appearance}</p>
      <p><b>Persönlichkeit:</b> ${n.personality}</p>
      <p><b>Stimme:</b> ${n.voice}</p>
      <p><b>Marotte:</b> ${n.quirk}</p>
      <p><b>Motivation:</b> ${n.motivation}</p>
      <section class="secret" id="secret-${foundry.utils.randomID()}"><p><b>Geheimnis:</b> ${n.secret}</p></section>`;
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
        system: { details: { biography: { value: this.#npcHtml() } } }
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
