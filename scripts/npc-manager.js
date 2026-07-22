/** NSC-Kartei: durchsuchbare Übersicht aller NSCs mit Filtern und Beziehungen. */

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Beziehungstyp → Gegenrichtung */
export const RELATION_TYPES = {
  "kennt": "kennt",
  "verwandt mit": "verwandt mit",
  "verbündet mit": "verbündet mit",
  "mag": "wird gemocht von",
  "hasst": "wird gehasst von",
  "schuldet etwas": "hat etwas gut bei",
  "arbeitet für": "beschäftigt",
  "fürchtet": "wird gefürchtet von"
};

export class NpcManager extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new NpcManager();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-npc-manager",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "NSC-Kartei", icon: "fa-solid fa-address-book" },
    position: { width: 640, height: 600 },
    actions: {
      openEntry: NpcManager.#onOpenEntry,
      relate: NpcManager.#onRelate,
      addRelation: NpcManager.#onAddRelation,
      removeRelation: NpcManager.#onRemoveRelation,
      cancelRelation: NpcManager.#onCancelRelation
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/npc-manager.hbs`,
      scrollable: [".gmtk-npc-list"]
    }
  };

  filters = { role: "", race: "", klass: "" };
  search = "";
  relSourceUuid = null;

  /* ---------------------------------- Daten ---------------------------------- */

  /** Alle NSC-Journale der Welt (per Flag markiert oder im GM-Toolkit-Ordner). */
  static collectNpcs() {
    const out = [];
    for (const entry of game.journal.contents) {
      const meta = entry.getFlag(MODULE_ID, "npc");
      const inFolder = entry.folder?.name === "GM Toolkit";
      const looksLikeNpc = meta || (inFolder && !/^(Session|Beute)/.test(entry.name));
      if (!looksLikeNpc) continue;
      if (entry.name === "Session-Chronik") continue;
      const relations = (entry.getFlag(MODULE_ID, "relations") ?? [])
        .map(rel => {
          const target = fromUuidSync(rel.uuid);
          return target ? { ...rel, name: target.name } : null;
        })
        .filter(Boolean);
      out.push({
        uuid: entry.uuid,
        name: entry.name,
        meta: meta ?? {},
        metaLine: meta
          ? [meta.raceLabel, meta.roleLabel, meta.level ? `${meta.classLabel} ${meta.level}` : meta.classLabel, meta.alignment]
              .filter(Boolean).join(" · ")
          : "(ohne Steckbrief-Daten)",
        relations
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return out;
  }

  async _prepareContext() {
    const npcs = NpcManager.collectNpcs();

    // Filteroptionen aus vorhandenen Daten ableiten
    const roles = {}, races = {}, klasses = {};
    for (const n of npcs) {
      if (n.meta.role) roles[n.meta.role] = n.meta.roleLabel;
      if (n.meta.race) races[n.meta.race] = n.meta.raceLabel;
      if (n.meta.klass) klasses[n.meta.klass] = n.meta.classLabel;
    }

    // Filter anwenden
    const filtered = npcs.filter(n => {
      if (this.filters.role && n.meta.role !== this.filters.role) return false;
      if (this.filters.race && n.meta.race !== this.filters.race) return false;
      if (this.filters.klass && n.meta.klass !== this.filters.klass) return false;
      return true;
    });

    const relSource = this.relSourceUuid ? filtered.concat(npcs).find(n => n.uuid === this.relSourceUuid) ?? npcs.find(n => n.uuid === this.relSourceUuid) : null;
    const relTargets = {};
    if (relSource) {
      for (const n of npcs) if (n.uuid !== relSource.uuid) relTargets[n.uuid] = n.name;
    }

    return {
      npcs: filtered,
      total: npcs.length,
      roles, races, klasses,
      filters: this.filters,
      search: this.search,
      relSource,
      relTargets,
      relationTypes: Object.fromEntries(Object.keys(RELATION_TYPES).map(k => [k, k]))
    };
  }

  _onRender() {
    // Live-Suche
    const input = this.element.querySelector('input[name="search"]');
    input?.addEventListener("input", (ev) => {
      this.search = ev.currentTarget.value;
      const q = this.search.toLowerCase();
      for (const li of this.element.querySelectorAll(".gmtk-npc-list > li")) {
        li.style.display = li.textContent.toLowerCase().includes(q) ? "" : "none";
      }
    });
    // Filter-Selects
    for (const key of ["role", "race", "klass"]) {
      const sel = this.element.querySelector(`select[name="filter-${key}"]`);
      sel?.addEventListener("change", (ev) => {
        this.filters[key] = ev.currentTarget.value;
        this.render();
      });
    }
  }

  /* ---------------------------------- Aktionen ---------------------------------- */

  static async #onOpenEntry(event, target) {
    const entry = await fromUuid(target.dataset.uuid);
    entry?.sheet.render(true);
  }

  static #onRelate(event, target) {
    this.relSourceUuid = target.dataset.uuid;
    this.render();
  }

  static #onCancelRelation() {
    this.relSourceUuid = null;
    this.render();
  }

  static async #onAddRelation() {
    const typeSel = this.element.querySelector('select[name="rel-type"]');
    const targetSel = this.element.querySelector('select[name="rel-target"]');
    if (!typeSel || !targetSel?.value || !this.relSourceUuid) return;

    const [a, b] = await Promise.all([fromUuid(this.relSourceUuid), fromUuid(targetSel.value)]);
    if (!a || !b) return ui.notifications.error("Eintrag nicht gefunden.");

    const label = typeSel.value;
    const inverse = RELATION_TYPES[label] ?? label;

    const relA = a.getFlag(MODULE_ID, "relations") ?? [];
    const relB = b.getFlag(MODULE_ID, "relations") ?? [];
    if (!relA.some(r => r.uuid === b.uuid && r.label === label)) {
      await a.setFlag(MODULE_ID, "relations", [...relA, { uuid: b.uuid, label }]);
    }
    if (!relB.some(r => r.uuid === a.uuid && r.label === inverse)) {
      await b.setFlag(MODULE_ID, "relations", [...relB, { uuid: a.uuid, label: inverse }]);
    }
    ui.notifications.info(`${a.name} ${label} ${b.name} – Beziehung beidseitig gespeichert.`);
    this.relSourceUuid = null;
    this.render();
  }

  static async #onRemoveRelation(event, target) {
    const { uuid, targetUuid, label } = target.dataset;
    const [a, b] = await Promise.all([fromUuid(uuid), fromUuid(targetUuid)]);
    if (a) {
      const relA = (a.getFlag(MODULE_ID, "relations") ?? []).filter(r => !(r.uuid === targetUuid && r.label === label));
      await a.setFlag(MODULE_ID, "relations", relA);
    }
    if (b) {
      const inverse = RELATION_TYPES[label] ?? label;
      const relB = (b.getFlag(MODULE_ID, "relations") ?? []).filter(r => !(r.uuid === uuid && r.label === inverse));
      await b.setFlag(MODULE_ID, "relations", relB);
    }
    this.render();
  }
}
