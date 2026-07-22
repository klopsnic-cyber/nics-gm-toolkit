/** NPC-Generator: Zufalls-NSCs mit Klasse, Stufe, Zaubern und Gesinnung.
 *  Einzelne Felder lassen sich neu würfeln; Schnell-NSC direkt in den Chat. */

import {
  RACES, GENDERS, ROLES, FIRST_NAMES, LAST_NAMES,
  APPEARANCES, PERSONALITIES, VOICES, MOTIVATIONS, SECRETS, QUIRKS,
  CLASS_CHOICES, LEVEL_CHOICES, CLASS_INFO, ROLE_CLASS_WEIGHTS, SPELLS,
  HOOKS, POCKET_ITEMS, ALIGNMENT_WEIGHTS, pick, pickWeighted, roll
} from "./data.js";
import { aiConfigured, callAI } from "./ai.js";

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* ------------------------------------------------------------------ */
/* Erzeugungslogik (auch ohne Fenster nutzbar)                          */
/* ------------------------------------------------------------------ */

function rollLevel(choice) {
  if (choice === "1-4") return 1 + Math.floor(Math.random() * 4);
  if (choice === "5-8") return 5 + Math.floor(Math.random() * 4);
  if (choice === "9-12") return 9 + Math.floor(Math.random() * 4);
  return Number(pickWeighted({ 1: 20, 2: 16, 3: 14, 4: 12, 5: 10, 6: 8, 7: 6, 8: 5, 9: 4, 10: 2, 11: 2, 12: 1 }));
}

function pickClass(choice, role) {
  if (choice === "zufall") return pick(Object.keys(CLASS_INFO).filter(k => k !== "kein"));
  if (choice === "passend") {
    const weights = ROLE_CLASS_WEIGHTS[role] ?? { kein: 70, kaempfer: 15, schurke: 15 };
    return pickWeighted(weights);
  }
  return choice;
}

function pickSome(arr, n) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function pickSpells(klass, level) {
  const info = CLASS_INFO[klass];
  const list = SPELLS[klass];
  if (!list || info.caster === "none") return null;
  if (info.caster === "half" && level < 2) return null;

  const result = [];
  if (list.tricks?.length) {
    const n = Math.min(2 + Math.floor(level / 4), list.tricks.length);
    result.push({ grade: "Zaubertricks", spells: pickSome(list.tricks, n) });
  }
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

function rollName(race, gender) {
  const first = pick(FIRST_NAMES[race][gender]);
  const lastRaw = pick(LAST_NAMES[race]);
  const last = lastRaw.startsWith("(") ? "" : lastRaw;
  return [first, last].filter(Boolean).join(" ");
}

function rollPockets(cls, lvl) {
  const coins = roll(2, 6) * (cls === "kein" ? 1 : Math.max(1, Math.floor(lvl / 2)));
  const pockets = [pick(POCKET_ITEMS)];
  if (Math.random() < 0.5) {
    const second = pick(POCKET_ITEMS);
    if (second !== pockets[0]) pockets.push(second);
  }
  return `${coins} GM, ${pockets.join(", ")}`;
}

/** Klasse/Stufe/Werte/Zauber auf einen NSC anwenden. */
function applyClass(npc, cls, levelChoice) {
  const info = CLASS_INFO[cls];
  const lvl = cls === "kein" ? 0 : rollLevel(levelChoice);
  npc.klass = cls;
  npc.classLabel = info.label;
  npc.level = lvl;
  npc.classLine = cls === "kein" ? info.label : `${info.label} Stufe ${lvl}`;
  npc.hp = cls === "kein" ? 3 + roll(1, 6) : lvl * info.hd + lvl;
  npc.ac = info.ac + (lvl >= 9 ? 1 : 0);
  npc.mainStat = info.main;
  npc.mainVal = cls === "kein" ? 10 : Math.min(14 + Math.floor(lvl / 4), 20);
  npc.statLine = cls === "kein"
    ? `TP ${npc.hp} · RK ${npc.ac}`
    : `TP ${npc.hp} · RK ${npc.ac} · ${info.main} ${npc.mainVal}`;
  npc.spells = pickSpells(cls, lvl);
  npc.pockets = rollPockets(cls, lvl);
}

export function generateNpc({ race = "zufall", gender = "zufall", role = "zufall", klass = "passend", level = "zufall" } = {}) {
  const r = race === "zufall" ? pick(Object.keys(RACES).filter(k => k !== "zufall")) : race;
  const g = gender === "zufall" ? pick(["m", "w"]) : gender;
  const ro = role === "zufall" ? pick(Object.keys(ROLES).filter(k => k !== "zufall")) : role;

  const npc = {
    name: rollName(r, g),
    race: r, raceLabel: RACES[r],
    gender: g, genderLabel: GENDERS[g],
    role: ro, roleLabel: ROLES[ro],
    age: 16 + roll(2, 30),
    alignment: pickWeighted(ALIGNMENT_WEIGHTS),
    appearance: pick(APPEARANCES),
    personality: pick(PERSONALITIES),
    voice: pick(VOICES),
    motivation: pick(MOTIVATIONS),
    secret: pick(SECRETS),
    quirk: pick(QUIRKS),
    hook: pick(HOOKS),
    // Auswahl merken, damit Rerolls im selben Rahmen bleiben
    klassChoice: klass,
    levelChoice: level
  };
  applyClass(npc, pickClass(klass, ro), level);
  return npc;
}

/** Würfelt genau ein Feld eines NSC neu. */
export function rerollField(npc, field) {
  switch (field) {
    case "name": npc.name = rollName(npc.race, npc.gender); break;
    case "age": npc.age = 16 + roll(2, 30); break;
    case "alignment": npc.alignment = pickWeighted(ALIGNMENT_WEIGHTS); break;
    case "appearance": npc.appearance = pick(APPEARANCES); break;
    case "personality": npc.personality = pick(PERSONALITIES); break;
    case "voice": npc.voice = pick(VOICES); break;
    case "quirk": npc.quirk = pick(QUIRKS); break;
    case "motivation": npc.motivation = pick(MOTIVATIONS); break;
    case "secret": npc.secret = pick(SECRETS); break;
    case "hook": npc.hook = pick(HOOKS); break;
    case "pockets": npc.pockets = rollPockets(npc.klass, npc.level); break;
    case "spells": npc.spells = pickSpells(npc.klass, npc.level); break;
    case "klasse": applyClass(npc, pickClass(npc.klassChoice, npc.role), npc.levelChoice); break;
  }
}

/** HTML-Steckbrief eines NSC (für Journal, Actor-Biografie und Chat). */
export function npcToHtml(npc) {
  let spellHtml = "";
  if (npc.spells?.length) {
    const rows = npc.spells.map(s => `<li><b>${s.grade}:</b> ${s.spells.join(", ")}</li>`).join("");
    spellHtml = `<p><b>Zauber:</b></p><ul>${rows}</ul>`;
  }
  return `
    <p><b>Volk:</b> ${npc.raceLabel} · <b>Geschlecht:</b> ${npc.genderLabel} · <b>Alter:</b> ${npc.age} · <b>Beruf:</b> ${npc.roleLabel}</p>
    <p><b>Klasse:</b> ${npc.classLine} · <b>Gesinnung:</b> ${npc.alignment} · <b>Werte:</b> ${npc.statLine}</p>
    <p><b>Aussehen:</b> ${npc.appearance}</p>
    <p><b>Persönlichkeit:</b> ${npc.personality}</p>
    <p><b>Stimme:</b> ${npc.voice}</p>
    <p><b>Marotte:</b> ${npc.quirk}</p>
    <p><b>Motivation:</b> ${npc.motivation}</p>
    <p><b>In den Taschen:</b> ${npc.pockets}</p>
    ${npc.aiText ? `<p><em>${npc.aiText}</em></p>` : ""}
    ${spellHtml}
    <section class="secret" id="secret-${foundry.utils.randomID()}">
      <p><b>Geheimnis:</b> ${npc.secret}</p>
      <p><b>Aufhänger:</b> ${npc.hook}</p>
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Fenster                                                              */
/* ------------------------------------------------------------------ */

export class NpcGenerator extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new NpcGenerator();
    this.#instance.render(true);
  }

  /** Schnell-NSC: ohne Fenster direkt als Flüsternachricht an den GM. */
  static async quick() {
    const npc = generateNpc();
    await ChatMessage.create({
      content: `<h3>⚡ ${npc.name}</h3>${npcToHtml(npc)}`,
      whisper: [game.user.id]
    });
    ui.notifications.info(`Schnell-NSC „${npc.name}" in den Chat geflüstert.`);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-npc-generator",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "NPC-Generator", icon: "fa-solid fa-user-plus" },
    position: { width: 560, height: "auto" },
    actions: {
      generate: NpcGenerator.#onGenerate,
      reroll: NpcGenerator.#onReroll,
      aiDescribe: NpcGenerator.#onAiDescribe,
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

  static #onGenerate() {
    this.#readOptions();
    this.npc = generateNpc(this.opts);
    this.render();
  }

  static #onReroll(event, target) {
    if (!this.npc) return;
    rerollField(this.npc, target.dataset.field);
    this.render();
  }

  static async #onAiDescribe() {
    if (!this.npc) return ui.notifications.warn("Erst einen NSC generieren.");
    if (!aiConfigured()) {
      return ui.notifications.warn("Erst in den Moduleinstellungen KI-Anbieter und API-Schlüssel hinterlegen.");
    }
    ui.notifications.info("KI formuliert die Beschreibung aus …");
    try {
      const n = this.npc;
      const prompt = `Schreibe eine kurze, atmosphärische Beschreibung (max. 80 Wörter, deutsch) dieses D&D-NSCs für den Spielleiter zum Vorlesen. Keine Werte, kein Geheimnis verraten:\n` +
        `${n.name}, ${n.raceLabel}, ${n.age} Jahre, ${n.roleLabel}, ${n.classLine}. ` +
        `Aussehen: ${n.appearance}. Persönlichkeit: ${n.personality}. Stimme: ${n.voice}. Marotte: ${n.quirk}.`;
      const text = await callAI(prompt, { system: "Du beschreibst NSCs knapp und stimmungsvoll. Antworte nur mit der Beschreibung.", maxTokens: 300 });
      this.npc.aiText = text.trim();
      this.render();
    } catch (err) {
      console.error("nics-gm-toolkit | KI-Beschreibung fehlgeschlagen", err);
      ui.notifications.error("KI-Anfrage fehlgeschlagen – Details in der Konsole (F12).");
    }
  }

  static async #onSaveJournal() {
    if (!this.npc) return ui.notifications.warn("Erst einen NSC generieren.");
    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === "GM Toolkit");
    folder ??= await Folder.create({ name: "GM Toolkit", type: "JournalEntry" });
    const n = this.npc;
    const entry = await JournalEntry.create({
      name: n.name,
      folder: folder.id,
      pages: [{ name: n.name, type: "text", text: { content: npcToHtml(n) } }],
      flags: {
        [MODULE_ID]: {
          npc: {
            role: n.role, roleLabel: n.roleLabel,
            race: n.race, raceLabel: n.raceLabel,
            klass: n.klass, classLabel: n.classLabel,
            level: n.level, alignment: n.alignment
          }
        }
      }
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
          details: { biography: { value: npcToHtml(this.npc) } },
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
      content: `<h3>${this.npc.name}</h3>${npcToHtml(this.npc)}`,
      whisper: [game.user.id]
    });
  }
}
