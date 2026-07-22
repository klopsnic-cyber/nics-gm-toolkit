/** Quest-Tracker: Quests als Journale mit Status, Auftraggeber-Verknüpfung
 *  und Übersichtsfenster. Statuswechsel landen in der Session-Chronik. */

import { NpcManager } from "./npc-manager.js";
import { Chronicle } from "./chronicle.js";

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const QUEST_STATUS = {
  offen: { label: "Offen", icon: "fa-regular fa-circle" },
  aktiv: { label: "Aktiv", icon: "fa-solid fa-circle-half-stroke" },
  erledigt: { label: "Erledigt", icon: "fa-solid fa-circle-check" },
  gescheitert: { label: "Gescheitert", icon: "fa-solid fa-circle-xmark" }
};

export class QuestTracker extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new QuestTracker();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-quest-tracker",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "Quest-Tracker", icon: "fa-solid fa-scroll" },
    position: { width: 620, height: 560 },
    actions: {
      toggleForm: QuestTracker.#onToggleForm,
      createQuest: QuestTracker.#onCreateQuest,
      openEntry: QuestTracker.#onOpenEntry,
      setStatus: QuestTracker.#onSetStatus
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/quest-tracker.hbs`,
      scrollable: [".gmtk-quest-list"]
    }
  };

  showForm = false;

  /* ---------------------------------- Daten ---------------------------------- */

  static collectQuests() {
    const out = [];
    for (const entry of game.journal.contents) {
      const q = entry.getFlag(MODULE_ID, "quest");
      if (!q) continue;
      const giver = q.giverUuid ? fromUuidSync(q.giverUuid) : null;
      out.push({
        uuid: entry.uuid,
        name: entry.name,
        status: q.status ?? "offen",
        statusLabel: QUEST_STATUS[q.status ?? "offen"]?.label,
        statusIcon: QUEST_STATUS[q.status ?? "offen"]?.icon,
        giverName: giver?.name ?? null,
        giverUuid: q.giverUuid ?? null,
        reward: q.reward ?? ""
      });
    }
    const order = { aktiv: 0, offen: 1, erledigt: 2, gescheitert: 3 };
    out.sort((a, b) => (order[a.status] - order[b.status]) || a.name.localeCompare(b.name, "de"));
    return out;
  }

  async _prepareContext() {
    const quests = QuestTracker.collectQuests();
    const npcs = {};
    for (const n of NpcManager.collectNpcs()) npcs[n.uuid] = n.name;
    return {
      quests,
      npcs,
      showForm: this.showForm,
      statusChoices: Object.fromEntries(Object.entries(QUEST_STATUS).map(([k, v]) => [k, v.label]))
    };
  }

  /* ---------------------------------- Aktionen ---------------------------------- */

  static #onToggleForm() {
    this.showForm = !this.showForm;
    this.render();
  }

  static async #onCreateQuest() {
    const val = (name) => this.element.querySelector(`[name="${name}"]`)?.value?.trim() ?? "";
    const name = val("quest-name");
    if (!name) return ui.notifications.warn("Die Quest braucht einen Namen.");
    const giverUuid = val("quest-giver");
    const reward = val("quest-reward");
    const description = val("quest-description");

    let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === "GM Toolkit");
    folder ??= await Folder.create({ name: "GM Toolkit", type: "JournalEntry" });

    const giver = giverUuid ? await fromUuid(giverUuid) : null;
    const parts = [
      `<p data-gmtk-status><b>Status:</b> Offen</p>`,
      description ? `<p>${description}</p>` : "",
      giver ? `<p><b>Auftraggeber:</b> @UUID[${giver.uuid}]{${giver.name}}</p>` : "",
      reward ? `<p><b>Belohnung:</b> ${reward}</p>` : ""
    ].filter(Boolean).join("\n");

    const entry = await JournalEntry.create({
      name,
      folder: folder.id,
      pages: [{ name, type: "text", text: { content: parts } }],
      flags: { [MODULE_ID]: { quest: { status: "offen", giverUuid: giver?.uuid ?? null, reward } } }
    });

    // Beziehung zum Auftraggeber (beidseitig, wie in der NSC-Kartei)
    if (giver) {
      const relG = giver.getFlag(MODULE_ID, "relations") ?? [];
      await giver.setFlag(MODULE_ID, "relations", [...relG, { uuid: entry.uuid, label: "Auftraggeber von" }]);
      await entry.setFlag(MODULE_ID, "relations", [{ uuid: giver.uuid, label: "Auftrag von" }]);
    }

    Chronicle.log("📜", `Neue Quest angelegt: <b>${name}</b>${giver ? ` (Auftraggeber: ${giver.name})` : ""}`);
    ui.notifications.info(`Quest „${name}" angelegt.`);
    this.showForm = false;
    this.render();
  }

  static async #onOpenEntry(event, target) {
    const entry = await fromUuid(target.dataset.uuid);
    entry?.sheet.render(true);
  }

  static async #onSetStatus(event, target) {
    const entry = await fromUuid(target.dataset.uuid);
    if (!entry) return;
    const status = target.dataset.status;
    const q = entry.getFlag(MODULE_ID, "quest") ?? {};
    await entry.setFlag(MODULE_ID, "quest", { ...q, status });

    // Status-Zeile in der Journal-Seite mitziehen
    const page = entry.pages.contents[0];
    if (page?.text?.content) {
      const div = document.createElement("div");
      div.innerHTML = page.text.content;
      const node = div.querySelector("[data-gmtk-status]");
      if (node) {
        node.innerHTML = `<b>Status:</b> ${QUEST_STATUS[status].label}`;
        await page.update({ "text.content": div.innerHTML });
      }
    }

    Chronicle.log("📜", `Quest <b>${entry.name}</b> → ${QUEST_STATUS[status].label}`);
    this.render();
  }
}
