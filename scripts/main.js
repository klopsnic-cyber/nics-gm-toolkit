/** Nics GM Toolkit – Einstiegspunkt */

import { Chronicle } from "./chronicle.js";
import { NpcGenerator } from "./npc-generator.js";
import { LootGenerator } from "./loot-generator.js";
import { LinkAssistant } from "./link-assistant.js";
import { NpcManager } from "./npc-manager.js";
import { EncounterGenerator } from "./encounter-generator.js";
import { ShopGenerator } from "./shop-generator.js";
import { QuestTracker } from "./quest-tracker.js";
import { Recap } from "./recap.js";
import { Atmosphere } from "./atmosphere.js";
import { registerAiSettings } from "./ai.js";
import { loadCustomTables } from "./data.js";

const MODULE_ID = "nics-gm-toolkit";

Hooks.once("init", () => {
  Chronicle.registerSettings();
  Recap.registerSettings();
  Atmosphere.registerSettings();
  registerAiSettings();
  console.log(`${MODULE_ID} | Initialisiert`);
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  Chronicle.init();
  await loadCustomTables();

  // API für Makros: game.modules.get("nics-gm-toolkit").api
  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    chronicle: Chronicle,
    openNpcGenerator: () => NpcGenerator.open(),
    quickNpc: () => NpcGenerator.quick(),
    openNpcManager: () => NpcManager.open(),
    openLootGenerator: () => LootGenerator.open(),
    openLinkAssistant: () => LinkAssistant.open(),
    openEncounterGenerator: () => EncounterGenerator.open(),
    openShopGenerator: () => ShopGenerator.open(),
    openQuestTracker: () => QuestTracker.open(),
    openAtmosphere: () => Atmosphere.open(),
    generateRecap: (opts) => Recap.generate(opts),
    toggleChronicle: () => Chronicle.toggle(),
    exportChronicle: () => Chronicle.exportLatest()
  };

  // Rückblick beim Sessionstart automatisch zeigen (falls aktiviert)
  Hooks.on("gmtk.sessionStarted", () => {
    if (game.settings.get(MODULE_ID, "recapOnStart")) Recap.generate({ show: true });
  });

  if (Chronicle.active) {
    ui.notifications.info("Session-Chronik läuft noch – über die Journal-Seitenleiste beenden.");
  }
});

/* ---------------------------------- Szenen-Steuerleiste ---------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;

  const tools = [
    {
      name: "gmtk-chronicle",
      title: "Session-Chronik starten/stoppen",
      icon: "fa-solid fa-book-bookmark",
      button: true,
      onClick: () => Chronicle.toggle(),
      onChange: () => Chronicle.toggle()
    },
    {
      name: "gmtk-npc",
      title: "NPC-Generator",
      icon: "fa-solid fa-user-plus",
      button: true,
      onClick: () => NpcGenerator.open(),
      onChange: () => NpcGenerator.open()
    },
    {
      name: "gmtk-loot",
      title: "Loot-Generator",
      icon: "fa-solid fa-coins",
      button: true,
      onClick: () => LootGenerator.open(),
      onChange: () => LootGenerator.open()
    },
    {
      name: "gmtk-links",
      title: "Verknüpfungs-Assistent",
      icon: "fa-solid fa-link",
      button: true,
      onClick: () => LinkAssistant.open(),
      onChange: () => LinkAssistant.open()
    }
  ];

  if (Array.isArray(controls)) {
    const notes = controls.find(c => c.name === "notes");
    if (notes) notes.tools.push(...tools);
  } else {
    const group = controls.notes ?? controls.tokens ?? Object.values(controls)[0];
    if (group?.tools) {
      let order = Object.keys(group.tools).length;
      for (const tool of tools) {
        group.tools[tool.name] = { ...tool, order: order++ };
      }
    }
  }
});

/* ---------------------------------- Journal-Seitenleiste ---------------------------------- */

Hooks.on("renderJournalDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const el = html instanceof HTMLElement ? html : html[0];
  if (!el || el.querySelector(".gmtk-toolbar")) return;

  const active = Chronicle.active;
  const bar = document.createElement("div");
  bar.className = "gmtk-toolbar";
  bar.innerHTML = `
    <button type="button" data-gmtk="chronicle" class="${active ? "gmtk-active" : ""}"
            data-tooltip="${active ? "Session-Chronik läuft – klicken zum Beenden" : "Session-Chronik starten"}">
      <i class="fa-solid ${active ? "fa-circle-stop" : "fa-circle-play"}"></i> Chronik
    </button>
    <button type="button" data-gmtk="export" data-tooltip="Letzte Session als Markdown exportieren">
      <i class="fa-solid fa-file-export"></i>
    </button>
    <button type="button" data-gmtk="recap" data-tooltip="Rückblick „Was bisher geschah' erzeugen">
      <i class="fa-solid fa-clock-rotate-left"></i>
    </button>
    <button type="button" data-gmtk="npc" data-tooltip="NPC-Generator öffnen">
      <i class="fa-solid fa-user-plus"></i> NSC
    </button>
    <button type="button" data-gmtk="quick" data-tooltip="Schnell-NSC direkt in den Chat">
      <i class="fa-solid fa-bolt"></i>
    </button>
    <button type="button" data-gmtk="manager" data-tooltip="NSC-Kartei (Suche, Filter, Beziehungen)">
      <i class="fa-solid fa-address-book"></i>
    </button>
    <button type="button" data-gmtk="loot" data-tooltip="Beute generieren">
      <i class="fa-solid fa-coins"></i> Loot
    </button>
    <button type="button" data-gmtk="encounter" data-tooltip="Begegnung nach XP-Budget auswürfeln">
      <i class="fa-solid fa-dragon"></i>
    </button>
    <button type="button" data-gmtk="shop" data-tooltip="Händler mit Inventar generieren">
      <i class="fa-solid fa-shop"></i>
    </button>
    <button type="button" data-gmtk="quests" data-tooltip="Quest-Tracker">
      <i class="fa-solid fa-scroll"></i>
    </button>
    <button type="button" data-gmtk="atmo" data-tooltip="Atmosphäre: Musik & Licht umschalten">
      <i class="fa-solid fa-masks-theater"></i>
    </button>
    <button type="button" data-gmtk="links" data-tooltip="Namen in Journal-Seiten verknüpfen">
      <i class="fa-solid fa-link"></i>
    </button>`;

  bar.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-gmtk]");
    if (!btn) return;
    switch (btn.dataset.gmtk) {
      case "chronicle":
        await Chronicle.toggle();
        ui.journal?.render();
        break;
      case "export": Chronicle.exportLatest(); break;
      case "npc": NpcGenerator.open(); break;
      case "quick": NpcGenerator.quick(); break;
      case "manager": NpcManager.open(); break;
      case "encounter": EncounterGenerator.open(); break;
      case "shop": ShopGenerator.open(); break;
      case "quests": QuestTracker.open(); break;
      case "recap": Recap.generate({ show: false }); break;
      case "atmo": Atmosphere.open(); break;
      case "loot": LootGenerator.open(); break;
      case "links": LinkAssistant.open(); break;
    }
  });

  const header = el.querySelector(".directory-header") ?? el.querySelector("header");
  if (header) header.after(bar);
  else el.prepend(bar);
});
