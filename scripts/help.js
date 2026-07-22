/** Anleitung: das Handbuch direkt in Foundry. */

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HelpWindow extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new HelpWindow();
    this.#instance.render(true);
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-help",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "GM Toolkit – Anleitung", icon: "fa-solid fa-circle-question" },
    position: { width: 640, height: 620 }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/help.hbs`,
      scrollable: [".gmtk-help"]
    }
  };
}
