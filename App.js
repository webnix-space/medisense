import { useState, useEffect } from "react";
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator,
  SafeAreaView, StatusBar
} from "react-native";
import { loadModel, completion, unloadModel } from "@qvac/sdk";

const MODEL_SRC = "hf:qvac/MedPsy-1.7B-GGUF/medpsy-1.7b-q4_k_m.gguf";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [modelId, setModelId] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
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
    setErrorMsg("");
    const start = Date.now();
    try {
      const id = await loadModel({
        modelSrc: MODEL_SRC,
        modelType: "llamacpp-completion",
        onProgress: (p) => {
          setProgress(Math.round(p * 100));
          setStatus("loading");
        }
      });
      setModelId(id);
      setStatus("ready");
      log({ event: "model_load", model: MODEL_SRC, load_ms: Date.now() - start });
    } catch (e) {
      setStatus("error");
      setErrorMsg(String(e?.message || e));
      log({ event: "model_error", error: String(e?.message || e) });
    }
  };

  const send = async () => {
    if (!input.trim() || !modelId || status !== "ready") return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setStatus("thinking");

    const history = [
      {
        role: "user",
        content: `You are MediSense, a private offline medical symptom screener. Be concise, clear and safe. Always remind the user you are not a doctor. Analyze symptoms and give triage guidance. User reports: ${userMsg}`
      }
    ];

    const start = Date.now();
    let response = "";
    let tokenCount = 0;
    let firstToken = null;

    try {
      const result = completion({ modelId, history, stream: true });
      for await (const token of result.tokenStream) {
        if (!firstToken) firstToken = Date.now() - start;
        response += token;
        tokenCount++;
        setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: response }]);
      }
      const elapsed = Date.now() - start;
      log({
        event: "inference",
        model: MODEL_SRC,
        prompt: userMsg,
        tokens: tokenCount,
        ttft_ms: firstToken,
        total_ms: elapsed,
        tps: parseFloat((tokenCount / (elapsed / 1000)).toFixed(2))
      });
    } catch (e) {
      setErrorMsg(String(e?.message || e));
      log({ event: "inference_error", error: String(e?.message || e) });
    }
    setStatus("ready");
  };

  const renderStatus = () => {
    if (status === "loading") return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#00c853" />
        <Text style={s.loadingText}>Loading model... {progress}%</Text>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={s.loadingSubtext}>First load may take a moment</Text>
      </View>
    );
    return null;
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.title}>MediSense</Text>
            <Text style={s.subtitle}>Private · Offline · On-Device AI</Text>
          </View>
          <View style={[s.statusDot, status === "ready" && s.dotGreen, status === "error" && s.dotRed, status === "thinking" && s.dotYellow]} />
        </View>
        {errorMsg ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={initModel} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <ScrollView style={s.chat} contentContainerStyle={s.chatContent}>
        {renderStatus()}
        {messages.length === 0 && status === "ready" && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🩺</Text>
            <Text style={s.emptyTitle}>How can I help?</Text>
            <Text style={s.emptyText}>Describe your symptoms privately. No data leaves your device.</Text>
            <View style={s.chips}>
              {["Headache & fever", "Chest tightness", "Fatigue & dizziness"].map(c => (
                <TouchableOpacity key={c} style={s.chip} onPress={() => setInput(c)}>
                  <Text style={s.chipText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i} style={[s.bubble, m.role === "user" ? s.userBubble : s.aiBubble]}>
            {m.role === "assistant" && <Text style={s.roleLabel}>MediSense</Text>}
            <Text style={s.bubbleText}>{m.content}</Text>
          </View>
        ))}
        {status === "thinking" && (
          <View style={s.aiBubble}>
            <Text style={s.roleLabel}>MediSense</Text>
            <ActivityIndicator size="small" color="#00c853" />
          </View>
        )}
      </ScrollView>

      <View style={s.inputArea}>
        <Text style={s.disclaimer}>⚠ Not a substitute for medical advice</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Describe your symptoms..."
            placeholderTextColor="#444"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[s.sendBtn, (status !== "ready" || !input.trim()) && s.sendBtnDisabled]}
            onPress={send}
            disabled={status !== "ready" || !input.trim()}
          >
            <Text style={s.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#111" },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: "#444", marginTop: 2, letterSpacing: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#333" },
  dotGreen: { backgroundColor: "#00c853" },
  dotRed: { backgroundColor: "#ff1744" },
  dotYellow: { backgroundColor: "#ffd600" },
  errorBox: { marginTop: 10, backgroundColor: "#1a0000", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#ff1744" },
  errorText: { color: "#ff6b6b", fontSize: 12 },
  retryBtn: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#ff1744", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  chat: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 8 },
  loadingContainer: { alignItems: "center", marginTop: 60, paddingHorizontal: 40 },
  loadingText: { color: "#00c853", fontSize: 16, marginTop: 16, fontWeight: "600" },
  loadingSubtext: { color: "#333", fontSize: 12, marginTop: 8 },
  progressBar: { width: "100%", height: 4, backgroundColor: "#111", borderRadius: 2, marginTop: 12, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#00c853", borderRadius: 2 },
  emptyState: { alignItems: "center", marginTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 8 },
  emptyText: { fontSize: 14, color: "#444", textAlign: "center", lineHeight: 20 },
  chips: { marginTop: 24, width: "100%", gap: 8 },
  chip: { backgroundColor: "#0d1f0d", borderWidth: 1, borderColor: "#00c853", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, alignSelf: "flex-start" },
  chipText: { color: "#00c853", fontSize: 13 },
  bubble: { marginBottom: 12, padding: 14, borderRadius: 16, maxWidth: "88%" },
  userBubble: { backgroundColor: "#0a1628", alignSelf: "flex-end", borderWidth: 1, borderColor: "#1a3a6a" },
  aiBubble: { backgroundColor: "#050f05", alignSelf: "flex-start", borderWidth: 1, borderColor: "#0d3d0d", minWidth: 80 },
  roleLabel: { fontSize: 10, color: "#00c853", fontWeight: "700", marginBottom: 6, letterSpacing: 1 },
  bubbleText: { color: "#e8e8e8", fontSize: 15, lineHeight: 22 },
  inputArea: { borderTopWidth: 1, borderTopColor: "#111", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  disclaimer: { fontSize: 10, color: "#2a2a2a", textAlign: "center", marginBottom: 8, letterSpacing: 0.5 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, backgroundColor: "#0d0d0d", color: "#fff", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: "#1a1a1a" },
  sendBtn: { width: 44, height: 44, backgroundColor: "#00c853", borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: "#0d1a0d" },
  sendIcon: { fontSize: 20, color: "#000", fontWeight: "bold" },
});
