import { useState, useEffect, useCallback, useRef } from "react";
import {
  Settings,
  ChevronRight,
  ChevronLeft,
  Check,
  Cloud,
  Key,
  Bot,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

// ─── Types ───

interface SettingsViewProps {
  isFirstLaunch?: boolean;
  onSetupComplete?: () => void;
}

interface SettingsState {
  // Azure
  AZURE_CLIENT_ID: string;
  AZURE_TENANT_ID: string;
  // LLM Keys
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  OPENROUTER_API_KEY: string;
  // Agent config
  AGENT_NAME: string;
  DEFAULT_PROVIDER: string;
  DEFAULT_MODEL: string;
  // Server
  PORT: string;
  // Polling
  POLL_INTERVAL_MS: string;
  // Skills
  BRAVE_API_KEY: string;
}

const EMPTY_SETTINGS: SettingsState = {
  AZURE_CLIENT_ID: "",
  AZURE_TENANT_ID: "",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  OPENROUTER_API_KEY: "",
  AGENT_NAME: "Pi Agent",
  DEFAULT_PROVIDER: "anthropic",
  DEFAULT_MODEL: "claude-sonnet-4-20250514",
  PORT: "3978",
  POLL_INTERVAL_MS: "2000",
  BRAVE_API_KEY: "",
};

const STEPS = [
  { id: "teams", label: "Teams Integration", icon: Cloud },
  { id: "llm", label: "LLM API Keys", icon: Key },
  { id: "agent", label: "Agent Config", icon: Bot },
] as const;

const PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic", keyField: "ANTHROPIC_API_KEY" },
  { value: "openai", label: "OpenAI", keyField: "OPENAI_API_KEY" },
  { value: "openrouter", label: "OpenRouter", keyField: "OPENROUTER_API_KEY" },
];

interface FetchedModel {
  id: string;
  label: string;
  provider: string;
}

// ─── Component ───

export default function SettingsView({ isFirstLaunch, onSetupComplete }: SettingsViewProps) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<SettingsState>(EMPTY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, FetchedModel[]>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});

  // Load existing settings
  useEffect(() => {
    window.agentAPI?.getSettings().then((s: Record<string, string>) => {
      if (s && Object.keys(s).length > 0) {
        setSettings((prev) => ({ ...prev, ...s }));
      }
      setLoaded(true);
    });
  }, []);

  // Fetch models when an API key is present for a provider
  const fetchedKeysRef = useRef<Record<string, string>>({});
  const fetchModelsForProvider = useCallback(async (provider: string, apiKey: string) => {
    if (!apiKey || apiKey.length < 8) return;
    // Avoid re-fetching if we already fetched for this exact key
    if (fetchedKeysRef.current[provider] === apiKey) return;
    fetchedKeysRef.current[provider] = apiKey;

    setFetchingModels((prev) => ({ ...prev, [provider]: true }));
    try {
      const models = await window.agentAPI?.fetchModels(provider, apiKey);
      if (models && models.length > 0) {
        setModelsByProvider((prev) => ({ ...prev, [provider]: models }));
      }
    } catch {
      // Silently ignore — invalid key or network error
    } finally {
      setFetchingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }, []);

  // Trigger model fetch when keys change (debounced)
  useEffect(() => {
    if (!loaded) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const { value, keyField } of PROVIDER_OPTIONS) {
      const key = settings[keyField as keyof SettingsState];
      if (key && key.length >= 8) {
        timers.push(setTimeout(() => fetchModelsForProvider(value, key), 500));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [loaded, settings.ANTHROPIC_API_KEY, settings.OPENAI_API_KEY, settings.OPENROUTER_API_KEY, fetchModelsForProvider]);

  const update = (key: keyof SettingsState, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Filter out empty values (except defaults)
      const toSave: Record<string, string> = {};
      for (const [key, value] of Object.entries(settings)) {
        if (value) toSave[key] = value;
      }
      await window.agentAPI?.saveSettings(toSave);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleFinishWizard = async () => {
    await handleSave();
    onSetupComplete?.();
  };

  const canProceedFromStep = (s: number): boolean => {
    switch (s) {
      case 0: return true; // Teams is optional
      case 1: return !!(settings.ANTHROPIC_API_KEY || settings.OPENAI_API_KEY || settings.OPENROUTER_API_KEY);
      case 2: return true;
      default: return true;
    }
  };

  if (!loaded) return null;

  const isWizard = isFirstLaunch;
  const totalSteps = STEPS.length;
  const currentStep = STEPS[step];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="drag-region shrink-0 flex items-center justify-between px-6 h-13 border-b border-[var(--color-border)]">
        <div className="no-drag flex items-center gap-2">
          <Settings size={15} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">
            {isWizard ? "Welcome — Let's get you set up" : "Settings"}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">

          {/* Step indicator */}
          <div className="flex items-center gap-1 mb-8">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <button
                  key={s.id}
                  onClick={() => !isWizard && setStep(i)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${isActive
                      ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                      : isDone
                        ? "text-[var(--color-green)] cursor-pointer"
                        : "text-[var(--color-text-dim)]"
                    }
                    ${!isWizard ? "hover:bg-[var(--color-surface-2)] cursor-pointer" : isActive ? "" : "cursor-default"}`}
                >
                  {isDone ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                  <span className="hidden sm:inline">{s.label}</span>
                  {i < totalSteps - 1 && (
                    <ChevronRight size={12} className="ml-1 text-[var(--color-text-dim)]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Step content */}
          <div className="space-y-6">
            {step === 0 && (
              <TeamsStep settings={settings} update={update} />
            )}
            {step === 1 && (
              <LLMStep settings={settings} update={update} />
            )}
            {step === 2 && (
              <AgentStep
                settings={settings}
                update={update}
                modelsByProvider={modelsByProvider}
                fetchingModels={fetchingModels}
              />
            )}
          </div>

          {/* Feedback */}
          {error && (
            <div className="mt-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-red-dim)] border border-red-500/20 text-sm text-[var(--color-red)]">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
          {saved && (
            <div className="mt-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-green-dim)] border border-green-500/20 text-sm text-[var(--color-green)]">
              <CheckCircle2 size={14} />
              Settings saved. Restart the agent for changes to take full effect.
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--color-border)]">
            <div>
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!isWizard && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium
                             bg-[var(--color-accent-dim)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors
                             disabled:opacity-50"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  Save Settings
                </button>
              )}
              {step < totalSteps - 1 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceedFromStep(step)}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium
                             bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              ) : isWizard ? (
                <button
                  onClick={handleFinishWizard}
                  disabled={saving || !canProceedFromStep(1)}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium
                             bg-[var(--color-green)] text-white hover:bg-green-600 transition-colors
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  Finish Setup
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step: Teams Integration ───

function TeamsStep({ settings, update }: { settings: SettingsState; update: (k: keyof SettingsState, v: string) => void }) {
  return (
    <>
      <div>
        <h2 className="text-base font-semibold mb-1">Microsoft Teams Integration</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          Connect to Teams by registering an Azure AD app. This is optional — you can skip this step and use the desktop chat UI only.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4">
        <FieldGroup
          label="Azure Client ID"
          description="From Azure Portal > App registrations > Application (client) ID"
          value={settings.AZURE_CLIENT_ID}
          onChange={(v) => update("AZURE_CLIENT_ID", v)}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
        <FieldGroup
          label="Azure Tenant ID"
          description="From Azure Portal > App registrations > Directory (tenant) ID"
          value={settings.AZURE_TENANT_ID}
          onChange={(v) => update("AZURE_TENANT_ID", v)}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </div>

      <HintBox>
        To set up Azure AD: go to{" "}
        <span className="font-mono text-[var(--color-accent)]">portal.azure.com</span>
        {" > Azure Active Directory > App registrations > New registration"}. Add{" "}
        <span className="font-mono text-[var(--color-text)]">ChannelMessage.Read.All</span> and{" "}
        <span className="font-mono text-[var(--color-text)]">ChannelMessage.Send</span> API permissions, then grant admin consent.
      </HintBox>
    </>
  );
}

// ─── Step: LLM Keys ───

function LLMStep({ settings, update }: { settings: SettingsState; update: (k: keyof SettingsState, v: string) => void }) {
  return (
    <>
      <div>
        <h2 className="text-base font-semibold mb-1">LLM API Keys</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          Add at least one API key to power the agent. Multiple providers can be configured for model selection.
        </p>
      </div>

      <div className="space-y-3">
        {PROVIDER_OPTIONS.map(({ value, label, keyField }) => (
          <div key={value} className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">{label}</span>
              {settings[keyField as keyof SettingsState] && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--color-green)]">
                  <CheckCircle2 size={12} />
                  Configured
                </span>
              )}
            </div>
            <SecretField
              value={settings[keyField as keyof SettingsState]}
              onChange={(v) => update(keyField as keyof SettingsState, v)}
              placeholder={
                value === "anthropic" ? "sk-ant-api03-..." :
                value === "openai" ? "sk-..." :
                "sk-or-v1-..."
              }
            />
          </div>
        ))}
      </div>

      <HintBox>
        At least one API key is required. Get keys from:{" "}
        <span className="font-mono text-[var(--color-accent)]">console.anthropic.com</span>,{" "}
        <span className="font-mono text-[var(--color-accent)]">platform.openai.com</span>, or{" "}
        <span className="font-mono text-[var(--color-accent)]">openrouter.ai</span>.
      </HintBox>
    </>
  );
}

// ─── Step: Agent Config ───

function AgentStep({ settings, update, modelsByProvider, fetchingModels }: {
  settings: SettingsState;
  update: (k: keyof SettingsState, v: string) => void;
  modelsByProvider: Record<string, FetchedModel[]>;
  fetchingModels: Record<string, boolean>;
}) {
  const provider = settings.DEFAULT_PROVIDER;
  const providerModels = modelsByProvider[provider] || [];
  const isLoadingModels = fetchingModels[provider] ?? false;

  // The model id stored in settings is without the provider prefix (e.g. "claude-sonnet-4-20250514")
  // But fetched models have "provider/model-id" format. We need to handle both.
  const getModelValue = (fetchedId: string) => {
    // Strip the provider prefix for storage (e.g. "anthropic/claude-sonnet-4" → "claude-sonnet-4")
    const parts = fetchedId.split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : fetchedId;
  };

  return (
    <>
      <div>
        <h2 className="text-base font-semibold mb-1">Agent Configuration</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          Configure the agent identity, default model, and server settings.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4">
        <FieldGroup
          label="Agent Name"
          description="Display name used for @mention detection in Teams"
          value={settings.AGENT_NAME}
          onChange={(v) => update("AGENT_NAME", v)}
          placeholder="Pi Agent"
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--color-text-muted)]">
            Default Provider
          </label>
          <div className="flex gap-2">
            {PROVIDER_OPTIONS.map(({ value, label, keyField }) => {
              const hasKey = !!settings[keyField as keyof SettingsState];
              const isSelected = settings.DEFAULT_PROVIDER === value;
              return (
                <button
                  key={value}
                  onClick={() => {
                    update("DEFAULT_PROVIDER", value);
                    // Auto-select first model from fetched list for the new provider
                    const models = modelsByProvider[value];
                    if (models?.[0]) {
                      update("DEFAULT_MODEL", getModelValue(models[0].id));
                    }
                  }}
                  disabled={!hasKey}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all
                    ${isSelected
                      ? "bg-[var(--color-accent-dim)] border-[var(--color-accent)]/30 text-[var(--color-accent)]"
                      : hasKey
                        ? "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                        : "border-[var(--color-border)] text-[var(--color-text-dim)] opacity-40 cursor-not-allowed"
                    }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
            Default Model
            {isLoadingModels && (
              <RefreshCw size={12} className="animate-spin text-[var(--color-accent)]" />
            )}
          </label>
          {providerModels.length > 0 ? (
            <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
              {providerModels.map((m) => {
                const modelValue = getModelValue(m.id);
                const isSelected = settings.DEFAULT_MODEL === modelValue;
                return (
                  <button
                    key={m.id}
                    onClick={() => update("DEFAULT_MODEL", modelValue)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-all
                      ${isSelected
                        ? "bg-[var(--color-accent-dim)] border-[var(--color-accent)]/30 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                      }`}
                  >
                    <div className="font-medium">{m.label}</div>
                    <div className="font-mono text-[10px] text-[var(--color-text-dim)] mt-0.5">{modelValue}</div>
                  </button>
                );
              })}
            </div>
          ) : isLoadingModels ? (
            <div className="px-3 py-4 text-xs text-[var(--color-text-dim)] text-center">
              Fetching models from {provider}...
            </div>
          ) : (
            <input
              type="text"
              value={settings.DEFAULT_MODEL}
              onChange={(e) => update("DEFAULT_MODEL", e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-[var(--color-surface-2)] border border-[var(--color-border)]
                         text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]
                         focus:outline-none focus:border-[var(--color-accent)]/40 transition-colors"
              placeholder="Enter model ID manually"
            />
          )}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4">
        <div className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider">Advanced</div>
        <div className="grid grid-cols-2 gap-4">
          <FieldGroup
            label="Server Port"
            description="HTTP port for the chat UI backend"
            value={settings.PORT}
            onChange={(v) => update("PORT", v)}
            placeholder="3978"
          />
          <FieldGroup
            label="Poll Interval (ms)"
            description="How often to check Teams for messages"
            value={settings.POLL_INTERVAL_MS}
            onChange={(v) => update("POLL_INTERVAL_MS", v)}
            placeholder="2000"
          />
        </div>
        <SecretFieldGroup
          label="Brave Search API Key"
          description="Optional — enables web search skill"
          value={settings.BRAVE_API_KEY}
          onChange={(v) => update("BRAVE_API_KEY", v)}
          placeholder="BSA-..."
        />
      </div>
    </>
  );
}

// ─── Shared UI components ───

function FieldGroup({
  label, description, value, onChange, placeholder,
}: {
  label: string; description?: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--color-text-muted)]">{label}</label>
      {description && (
        <p className="text-[11px] text-[var(--color-text-dim)] leading-relaxed">{description}</p>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-[var(--color-surface-2)] border border-[var(--color-border)]
                   text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]
                   focus:outline-none focus:border-[var(--color-accent)]/40 transition-colors"
      />
    </div>
  );
}

function SecretField({
  value, onChange, placeholder,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-10 rounded-lg text-sm font-mono bg-[var(--color-surface-2)] border border-[var(--color-border)]
                   text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]
                   focus:outline-none focus:border-[var(--color-accent)]/40 transition-colors"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] transition-colors"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function SecretFieldGroup({
  label, description, value, onChange, placeholder,
}: {
  label: string; description?: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--color-text-muted)]">{label}</label>
      {description && (
        <p className="text-[11px] text-[var(--color-text-dim)] leading-relaxed">{description}</p>
      )}
      <SecretField value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

function HintBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)] leading-relaxed">
      <AlertCircle size={14} className="shrink-0 mt-0.5 text-[var(--color-text-dim)]" />
      <div>{children}</div>
    </div>
  );
}
