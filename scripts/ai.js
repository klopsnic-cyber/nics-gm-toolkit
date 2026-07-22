/** Optionale KI-Anbindung (OpenAI oder Anthropic) für Beschreibungen
 *  und Session-Zusammenfassungen. Ohne API-Key bleibt alles deaktiviert. */

const MODULE_ID = "nics-gm-toolkit";

export function registerAiSettings() {
  game.settings.register(MODULE_ID, "aiProvider", {
    name: "KI: Anbieter",
    hint: "Optional. Für ausformulierte NSC-Beschreibungen und Rückblicke in Prosa.",
    scope: "world", config: true, type: String, default: "none",
    choices: { none: "Deaktiviert", ollama: "Ollama (lokal, kostenlos)", anthropic: "Anthropic (Claude)", openai: "OpenAI (GPT)" }
  });
  game.settings.register(MODULE_ID, "aiUrl", {
    name: "KI: Ollama-Adresse",
    hint: "Nur für Ollama. Standard: http://localhost:11434 – bei CORS-Fehlern die Umgebungsvariable OLLAMA_ORIGINS setzen (siehe README).",
    scope: "world", config: true, type: String, default: "http://localhost:11434"
  });
  game.settings.register(MODULE_ID, "aiApiKey", {
    name: "KI: API-Schlüssel",
    hint: "Achtung: Der Schlüssel wird in den Welteinstellungen gespeichert. Nutze einen Schlüssel mit Ausgabenlimit.",
    scope: "world", config: true, type: String, default: ""
  });
  game.settings.register(MODULE_ID, "aiModel", {
    name: "KI: Modell (optional)",
    hint: "Leer lassen für den Standard (claude-3-5-haiku-latest bzw. gpt-4o-mini).",
    scope: "world", config: true, type: String, default: ""
  });
}

export function aiConfigured() {
  const provider = game.settings.get(MODULE_ID, "aiProvider");
  if (provider === "none") return false;
  if (provider === "ollama") return true; // kein Schlüssel nötig
  return !!game.settings.get(MODULE_ID, "aiApiKey");
}

/** Schickt einen Prompt an den konfigurierten Anbieter und liefert den Text zurück. */
export async function callAI(prompt, { system = "", maxTokens = 800, json = false } = {}) {
  const provider = game.settings.get(MODULE_ID, "aiProvider");
  const key = game.settings.get(MODULE_ID, "aiApiKey");
  const model = game.settings.get(MODULE_ID, "aiModel");
  if (!aiConfigured()) throw new Error("Keine KI konfiguriert.");

  if (provider === "ollama") {
    const base = (game.settings.get(MODULE_ID, "aiUrl") || "http://localhost:11434").replace(/\/+$/, "");
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const body = {
      model: model || "llama3.1",
      stream: false,
      messages,
      options: { num_predict: maxTokens }
    };
    if (json) body.format = "json";
    const resp = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(`Ollama: ${resp.status} ${await resp.text()} – Läuft Ollama? Ist OLLAMA_ORIGINS gesetzt?`);
    const data = await resp.json();
    return data.message?.content ?? "";
  }

  if (provider === "anthropic") {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: model || "claude-3-5-haiku-latest",
        max_tokens: maxTokens,
        system: system || undefined,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!resp.ok) throw new Error(`Anthropic-API: ${resp.status} ${await resp.text()}`);
    const data = await resp.json();
    return data.content?.map(c => c.text ?? "").join("") ?? "";
  }

  if (provider === "openai") {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${key}`
      },
      body: JSON.stringify({ model: model || "gpt-4o-mini", max_tokens: maxTokens, messages })
    });
    if (!resp.ok) throw new Error(`OpenAI-API: ${resp.status} ${await resp.text()}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  throw new Error(`Unbekannter Anbieter: ${provider}`);
}
