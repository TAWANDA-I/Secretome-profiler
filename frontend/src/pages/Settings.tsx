import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, clearAuth, getStoredUser } from "@/api/auth";

export default function Settings() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasKey, setHasKey] = useState(user?.has_api_key ?? false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const flash = (msg: string, type: "success" | "error" = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 4000);
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      flash("Please enter your API key", "error");
      return;
    }
    setSaving(true);
    try {
      await authApi.saveApiKey(apiKey.trim());
      setApiKey("");
      setHasKey(true);
      // Update stored user
      const stored = getStoredUser();
      if (stored) {
        localStorage.setItem(
          "secretome_user",
          JSON.stringify({ ...stored, has_api_key: true })
        );
      }
      flash("API key saved securely. You can now run analyses.");
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : "Failed to save key", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!window.confirm("Remove your API key? You will need to add it again to run analyses.")) return;
    setDeleting(true);
    try {
      await authApi.deleteApiKey();
      setHasKey(false);
      const stored = getStoredUser();
      if (stored) {
        localStorage.setItem(
          "secretome_user",
          JSON.stringify({ ...stored, has_api_key: false })
        );
      }
      flash("API key removed");
    } catch {
      flash("Failed to remove key", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>

      {message && (
        <div
          className={`mb-5 px-4 py-3 rounded-lg text-sm border ${
            messageType === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      {/* Account */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Account</h2>
        <p className="text-sm text-gray-600 mb-4">
          <span className="font-medium text-gray-800">Email: </span>
          {user?.email}
        </p>
        <button
          onClick={handleLogout}
          className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>

      {/* Anthropic API Key */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-2">
          Anthropic API Key
        </h2>
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
          Required to run analyses and use AI features. Your key is encrypted
          with AES-256 and never stored in plaintext.{" "}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            Get a key at console.anthropic.com ↗
          </a>
        </p>

        {/* Status badge */}
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-4 ${
            hasKey
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-yellow-50 text-yellow-800 border border-yellow-200"
          }`}
        >
          <span>{hasKey ? "✓" : "⚠"}</span>
          {hasKey ? "API key is saved and active" : "No API key — add one to run analyses"}
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-api03-…"
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 cursor-pointer"
            title={showKey ? "Hide" : "Show"}
          >
            {showKey ? "🙈" : "👁"}
          </button>
          <button
            onClick={handleSaveKey}
            disabled={saving || !apiKey.trim()}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            {saving ? "Saving…" : "Save key"}
          </button>
        </div>

        {hasKey && (
          <button
            onClick={handleDeleteKey}
            disabled={deleting}
            className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 cursor-pointer disabled:opacity-50"
          >
            {deleting ? "Removing…" : "Remove API key"}
          </button>
        )}
      </div>

      {hasKey && (
        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            ← Back to New Analysis
          </button>
        </div>
      )}
    </div>
  );
}
