/** Verknüpfungs-Assistent: findet Namen vorhandener Dokumente in Journal-Seiten
 *  und wandelt sie in @UUID-Verknüpfungen um. Nutzt Foundrys eigenes Journal. */

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LinkAssistant extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new LinkAssistant();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-link-assistant",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "Verknüpfungs-Assistent", icon: "fa-solid fa-link" },
    position: { width: 560, height: "auto" },
    actions: {
      scan: LinkAssistant.#onScan,
      apply: LinkAssistant.#onApply
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/link-assistant.hbs` }
  };

  selectedPage = "";
  matches = null;   // [{uuid, name, type, count}]
  scannedPageUuid = null;

  async _prepareContext() {
    // Alle Text-Seiten aller Journale als Auswahl
    const pages = {};
    for (const journal of game.journal.contents) {
      for (const page of journal.pages.contents) {
        if (page.type !== "text") continue;
        pages[page.uuid] = `${journal.name} → ${page.name}`;
      }
    }
    return { pages, selectedPage: this.selectedPage, matches: this.matches };
  }

  /* ---------------------------------- Kandidaten ---------------------------------- */

  /** Alle verknüpfbaren Dokumente der Welt: Journale, Actors, Items, Szenen. */
  static #candidates(excludeUuid) {
    const out = [];
    const add = (doc, type) => {
      if (!doc.name || doc.name.length < 3) return;
      if (doc.uuid === excludeUuid) return;
      out.push({ uuid: doc.uuid, name: doc.name, type });
    };
    for (const j of game.journal.contents) {
      add(j, "Journal");
      for (const p of j.pages.contents) if (p.uuid !== excludeUuid && p.name !== j.name) add(p, "Seite");
    }
    for (const a of game.actors.contents) add(a, "Actor");
    for (const i of game.items.contents) add(i, "Item");
    for (const s of game.scenes.contents) add(s, "Szene");
    // Längste Namen zuerst, damit „Burg Falkenstein" vor „Falkenstein" greift
    out.sort((a, b) => b.name.length - a.name.length);
    return out;
  }

  static #escapeRe(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* ---------------------------------- Scan ---------------------------------- */

  static async #onScan() {
    const select = this.element.querySelector('[name="page"]');
    if (!select?.value) return ui.notifications.warn("Bitte eine Journal-Seite wählen.");
    this.selectedPage = select.value;

    const page = await fromUuid(this.selectedPage);
    if (!page) return ui.notifications.error("Seite nicht gefunden.");

    const content = page.text?.content ?? "";
    // Nur sichtbaren Text durchsuchen, nicht HTML-Attribute
    const div = document.createElement("div");
    div.innerHTML = content;
    const visibleText = div.textContent;

    const parentUuid = page.parent?.uuid;
    const matches = [];
    for (const cand of LinkAssistant.#candidates(page.uuid)) {
      if (cand.uuid === parentUuid) continue;
      if (cand.name === page.name) continue;
      const re = new RegExp(`(?<![\\wäöüÄÖÜß])${LinkAssistant.#escapeRe(cand.name)}(?![\\wäöüÄÖÜß])`, "g");
      const found = visibleText.match(re);
      if (!found) continue;
      // Bereits verlinkte Namen überspringen
      if (content.includes(`{${cand.name}}`) || content.includes(`@UUID[${cand.uuid}]`)) continue;
      if (!matches.some(m => m.name === cand.name)) {
        matches.push({ ...cand, count: found.length });
      }
    }
    this.matches = matches;
    this.scannedPageUuid = page.uuid;
    if (!matches.length) ui.notifications.info("Keine unverknüpften Namen gefunden.");
    this.render();
  }

  /* ---------------------------------- Anwenden ---------------------------------- */

  static async #onApply() {
    if (!this.matches?.length || !this.scannedPageUuid) return;
    const checked = [...this.element.querySelectorAll('input[name="match"]:checked')]
      .map(el => el.value);
    if (!checked.length) return ui.notifications.warn("Nichts ausgewählt.");

    const page = await fromUuid(this.scannedPageUuid);
    if (!page) return ui.notifications.error("Seite nicht mehr vorhanden.");

    const selected = this.matches.filter(m => checked.includes(m.uuid));

    // DOM-basiert ersetzen: nur Textknoten anfassen, HTML bleibt unversehrt
    const div = document.createElement("div");
    div.innerHTML = page.text?.content ?? "";

    let replaced = 0;
    for (const match of selected) {
      const re = new RegExp(`(?<![\\wäöüÄÖÜß])${LinkAssistant.#escapeRe(match.name)}(?![\\wäöüÄÖÜß])`);
      if (this.#replaceFirstInTextNodes(div, re, `@UUID[${match.uuid}]{${match.name}}`)) replaced++;
    }

    if (replaced) {
      await page.update({ "text.content": div.innerHTML });
      ui.notifications.info(`${replaced} Verknüpfung(en) in „${page.name}" eingefügt.`);
    }
    this.matches = null;
    this.render();
  }

  /** Ersetzt das erste Vorkommen von `re` in einem Textknoten unterhalb von root. */
  #replaceFirstInTextNodes(root, re, replacement) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Innerhalb von Links nichts ersetzen
        if (node.parentElement?.closest("a")) return NodeFilter.FILTER_REJECT;
        return re.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const node = walker.nextNode();
    if (!node) return false;
    node.nodeValue = node.nodeValue.replace(re, replacement);
    return true;
  }
}
