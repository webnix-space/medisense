import { useState, useEffect } from "react";
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator
} from "react-native";
import { loadModel, completion, unloadModel } from "@qvac/sdk";

const MODEL_ID = "LLAMA_3_2_1B_INST_Q4_0";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [modelId, setModelId] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);

  const log = (entry) => {
    const record = { ...entry, timestamp: Date.now() };
    setLogs(prev => [...prev, record]);
    console.log(JSON.stringify(record));
  };

  useEffect(() => {
    initModel();
    return () => { if (modelId) unloadModel({ modelId }); };
  }, []);

  const initModel = async () => {
    setStatus("loading");
    const start = Date.now();
    try {
      const id = await loadModel({
        modelSrc: MODEL_ID,
        onProgress: (p) => setStatus(`Loading ${Math.round(p*100)}%`)
      });
      setModelId(id);
      setStatus("ready");
      log({ event: "model_load", model: MODEL_ID, ttft_ms: Date.now() - start });
    } catch (e) {
      setStatus("error");
      log({ event: "model_error", error: e.message });
    }
  };

  const send = async () => {
    if (!input.trim() || !modelId || status !== "ready") return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setStatus("thinking");

    const history = [
      { role: "user", content: `You are MediSense, a private offline medical symptom screener. Give clear, safe triage guidance. Never replace a doctor. User says: ${userMsg}` }
    ];

    const start = Date.now();
    let response = "";
    let tokenCount = 0;

    try {
      const result = completion({ modelId, history, stream: true });
      for await (const token of result.tokenStream) {
        response += token;
        tokenCount++;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { role: "assistant", content: response };
          } else {
            updated.push({ role: "assistant", content: response });
          }
          return updated;
        });
      }
      const elapsed = Date.now() - start;
      log({
        event: "inference",
        model: MODEL_ID,
        prompt: userMsg,
        tokens: tokenCount,
        ttft_ms: elapsed,
        tps: (tokenCount / (elapsed / 1000)).toFixed(2)
      });
    } catch (e) {
      log({ event: "inference_error", error: e.message });
    }
    setStatus("ready");
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>MediSense</Text>
        <Text style={s.subtitle}>100% on-device · no cloud · private</Text>
        <View style={[s.badge, status === "ready" && s.badgeGreen]}>
          <Text style={s.badgeText}>{status.toUpperCase()}</Text>
        </View>
      </View>
      <ScrollView style={s.chat} contentContainerStyle={{ padding: 16 }}>
        {messages.length === 0 && status === "ready" && (
          <Text style={s.placeholder}>Describe your symptoms. Everything stays on your device.</Text>
        )}
        {status === "loading" || status.startsWith("Loading") ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#00ff88" />
            <Text style={s.loadText}>{status}</Text>
          </View>
        ) : null}
        {messages.map((m, i) => (
          <View key={i} style={[s.bubble, m.role === "user" ? s.userBubble : s.aiBubble]}>
            <Text style={s.bubbleText}>{m.content}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Describe symptoms..."
          placeholderTextColor="#555"
          multiline
        />
        <TouchableOpacity
          style={[s.btn, status !== "ready" && s.btnDisabled]}
          onPress={send}
          disabled={status !== "ready"}
        >
          <Text style={s.btnText}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { padding: 20, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  title: { fontSize: 28, fontWeight: "bold", color: "#00ff88" },
  subtitle: { fontSize: 12, color: "#555", marginTop: 2 },
  badge: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#1a1a1a", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeGreen: { backgroundColor: "#003322" },
  badgeText: { color: "#00ff88", fontSize: 11, fontWeight: "bold" },
  chat: { flex: 1 },
  placeholder: { color: "#333", textAlign: "center", marginTop: 40, fontSize: 14 },
  center: { alignItems: "center", marginTop: 60 },
  loadText: { color: "#00ff88", marginTop: 12 },
  bubble: { marginBottom: 12, padding: 14, borderRadius: 16, maxWidth: "85%" },
  userBubble: { backgroundColor: "#1a1a2e", alignSelf: "flex-end" },
  aiBubble: { backgroundColor: "#0d1f0d", alignSelf: "flex-start", borderWidth: 1, borderColor: "#003322" },
  bubbleText: { color: "#e0e0e0", fontSize: 15, lineHeight: 22 },
  inputRow: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "#1a1a1a" },
  input: { flex: 1, backgroundColor: "#111", color: "#fff", borderRadius: 12, padding: 12, fontSize: 15, maxHeight: 100 },
  btn: { marginLeft: 8, backgroundColor: "#00ff88", width: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnDisabled: { backgroundColor: "#1a1a1a" },
  btnText: { fontSize: 20, color: "#000", fontWeight: "bold" },
});
