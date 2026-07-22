/** Atmosphäre: schaltet Stimmungen um – Playlist an/aus und optional
 *  die Szenenbeleuchtung. Playlist-Namen sind in den Einstellungen frei belegbar. */

const MODULE_ID = "nics-gm-toolkit";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const MOODS = {
  taverne: { label: "Taverne", icon: "fa-solid fa-beer-mug-empty", darkness: 0.1 },
  stadt: { label: "Stadt & Markt", icon: "fa-solid fa-city", darkness: 0.05 },
  reise: { label: "Reise", icon: "fa-solid fa-route", darkness: 0.15 },
  lager: { label: "Lagerfeuer & Rast", icon: "fa-solid fa-fire", darkness: 0.65 },
  kampf: { label: "Kampf", icon: "fa-solid fa-hand-fist", darkness: null },
  grusel: { label: "Grusel & Dungeon", icon: "fa-solid fa-ghost", darkness: 0.85 },
  stille: { label: "Stille (alles aus)", icon: "fa-solid fa-volume-xmark", darkness: null }
};

export class Atmosphere extends HandlebarsApplicationMixin(ApplicationV2) {

  static #instance = null;

  static open() {
    this.#instance ??= new Atmosphere();
    this.#instance.render(true);
  }

  static registerSettings() {
    for (const [key, mood] of Object.entries(MOODS)) {
      if (key === "stille") continue;
      game.settings.register(MODULE_ID, `playlist-${key}`, {
        name: `Atmosphäre: Playlist für „${mood.label}"`,
        hint: "Name einer Playlist in deiner Welt (leer = keine Musik für diese Stimmung).",
        scope: "world", config: true, type: String, default: ""
      });
    }
    game.settings.register(MODULE_ID, "atmoDarkness", {
      name: "Atmosphäre: Szenenbeleuchtung anpassen",
      hint: "Stimmungen dürfen die Dunkelheit der aktuellen Szene ändern.",
      scope: "world", config: true, type: Boolean, default: true
    });
  }

  static DEFAULT_OPTIONS = {
    id: "gmtk-atmosphere",
    classes: ["gmtk-app"],
    tag: "div",
    window: { title: "Atmosphäre", icon: "fa-solid fa-masks-theater" },
    position: { width: 380, height: "auto" },
    actions: {
      setMood: Atmosphere.#onSetMood
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/atmosphere.hbs` }
  };

  activeMood = null;

  async _prepareContext() {
    const moods = Object.entries(MOODS).map(([key, m]) => {
      const plName = key === "stille" ? null : game.settings.get(MODULE_ID, `playlist-${key}`);
      return {
        key,
        ...m,
        playlist: plName || null,
        configured: key === "stille" || !!plName,
        active: this.activeMood === key
      };
    });
    return { moods, darknessEnabled: game.settings.get(MODULE_ID, "atmoDarkness") };
  }

  static async #onSetMood(event, target) {
    const key = target.dataset.mood;
    const mood = MOODS[key];
    if (!mood) return;

    // Laufende Playlists stoppen
    for (const pl of game.playlists.filter(p => p.playing)) {
      await pl.stopAll();
    }

    // Passende Playlist starten
    if (key !== "stille") {
      const wanted = game.settings.get(MODULE_ID, `playlist-${key}`);
      if (wanted) {
        const pl = game.playlists.find(p => p.name.toLowerCase() === wanted.toLowerCase());
        if (pl) await pl.playAll();
        else ui.notifications.warn(`Playlist „${wanted}" nicht gefunden.`);
      }
    }

    // Beleuchtung
    if (game.settings.get(MODULE_ID, "atmoDarkness") && mood.darkness !== null && canvas?.scene) {
      try {
        await canvas.scene.update(
          { "environment.darknessLevel": mood.darkness },
          { animateDarkness: 3000 }
        );
      } catch (err) {
        try { await canvas.scene.update({ darkness: mood.darkness }, { animateDarkness: 3000 }); }
        catch (err2) { console.warn(`${MODULE_ID} | Dunkelheit konnte nicht gesetzt werden`, err2); }
      }
    }

    this.activeMood = key;
    ui.notifications.info(`Atmosphäre: ${mood.label}`);
    this.render();
  }
}
