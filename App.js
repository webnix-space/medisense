import { useState, useEffect, useRef } from "react";
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator,
  SafeAreaView, StatusBar
} from "react-native";
import { loadModel, completion, unloadModel } from "@qvac/sdk";

const MODEL_SRC = "https://huggingface.co/qvac/MedPsy-1.7B-GGUF/resolve/main/medpsy-1.7b-q4_k_m-imat.gguf";

const stripThinking = (text) => text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

export default function App() {
  const [status, setStatus] = useState("idle");
  const [modelId, setModelId] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const scrollRef = useRef(null);

  const log = (entry) => {
    const record = { ...entry, timestamp: Date.now() };
    setLogs(prev => [...prev, record]);
    console.log(JSON.stringify(record));
  };

  useEffect(() => {
    initModel();
    return () => { if (modelId) unloadModel({ modelId }); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const initModel = async () => {
    setStatus("loading");
    setErrorMsg("");
    const start = Date.now();
    try {
      const id = await loadModel({
        modelSrc: MODEL_SRC,
        modelType: "llamacpp-completion",
        modelConfig: { device: "cpu", ctx_size: 2048 },
        onProgress: (p) => setProgress(Math.round((p.percentage || 0)))
      });
      setModelId(id);
      setStatus("ready");
      log({ event: "model_load", model: "MedPsy-1.7B", load_ms: Date.now() - start });
    } catch (e) {
      setStatus("error");
      setErrorMsg(String(e?.message || e));
      log({ event: "model_error", error: String(e?.message || e) });
    }
  };

  const newChat = () => {
    setMessages([]);
    setErrorMsg("");
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
        content: `You are MediSense, a private offline medical symptom screener powered by MedPsy AI. Be concise and safe. Always remind you are not a doctor. Give triage guidance and safe general wellness advice like hydration, rest, breathing exercises when appropriate. User reports: ${userMsg}`
      }
    ];

    const start = Date.now();
    let rawResponse = "";
    let tokenCount = 0;
    let firstToken = null;

    try {
      const result = completion({ modelId, history, stream: true });
      for await (const token of result.tokenStream) {
        if (!firstToken) firstToken = Date.now() - start;
        rawResponse += token;
        tokenCount++;
        const clean = stripThinking(rawResponse);
        if (clean) {
          setMessages([...newMessages, { role: "assistant", content: clean }]);
        }
      }
      const elapsed = Date.now() - start;
      log({
        event: "inference",
        model: "MedPsy-1.7B",
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

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.title}>MediSense</Text>
            <Text style={s.subtitle}>MedPsy-1.7B · Private · Offline</Text>
          </View>
          <View style={s.headerRight}>
            <View style={[s.statusDot, status === "ready" && s.dotGreen, status === "error" && s.dotRed, status === "thinking" && s.dotYellow]} />
            {messages.length > 0 && status === "ready" && (
              <TouchableOpacity onPress={newChat} style={s.newChatBtn}>
                <Text style={s.newChatText}>+ New</Text>
              </TouchableOpacity>
            )}
          </View>
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

      <ScrollView ref={scrollRef} style={s.chat} contentContainerStyle={s.chatContent}>
        {(status === "loading") ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color="#00c853" />
            <Text style={s.loadingText}>Loading MedPsy... {progress}%</Text>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={s.loadingSubtext}>First load downloads model over WiFi</Text>
          </View>
        ) : null}

        {messages.length === 0 && status === "ready" && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🩺</Text>
            <Text style={s.emptyTitle}>MediSense</Text>
            <Text style={s.emptyText}>Private symptom screening. Powered by MedPsy AI. No data leaves your device.</Text>
            <View style={s.chips}>
              {["Headache & fever", "Chest tightness", "Fatigue & dizziness", "Stomach pain"].map(c => (
                <TouchableOpacity key={c} style={s.chip} onPress={() => setInput(c)}>
                  <Text style={s.chipText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {messages.map((m, i) => (
          <View key={i} style={[s.bubble, m.role === "user" ? s.userBubble : s.aiBubble]}>
            {m.role === "assistant" && <Text style={s.roleLabel}>MEDISENSE</Text>}
            <Text style={s.bubbleText}>{m.content}</Text>
          </View>
        ))}

        {status === "thinking" && (
          <View style={s.aiBubble}>
            <Text style={s.roleLabel}>MEDISENSE</Text>
            <ActivityIndicator size="small" color="#00c853" />
          </View>
        )}
      </ScrollView>

      <View style={s.inputArea}>
        <Text style={s.disclaimer}>⚠ Not a substitute for professional medical advice</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Describe your symptoms..."
            placeholderTextColor="#444"
            multiline
            maxLength={500}
            onSubmitEditing={send}
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
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", letterSpacing: 0.5 },
  subtitle: { fontSize: 10, color: "#333", marginTop: 2, letterSpacing: 0.8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#333" },
  dotGreen: { backgroundColor: "#00c853" },
  dotRed: { backgroundColor: "#ff1744" },
  dotYellow: { backgroundColor: "#ffd600" },
  newChatBtn: { backgroundColor: "#0d1f0d", borderWidth: 1, borderColor: "#00c853", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  newChatText: { color: "#00c853", fontSize: 12, fontWeight: "600" },
  errorBox: { marginTop: 10, backgroundColor: "#1a0000", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#ff1744" },
  errorText: { color: "#ff6b6b", fontSize: 12 },
  retryBtn: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#ff1744", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  chat: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 8 },
  loadingContainer: { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
  loadingText: { color: "#00c853", fontSize: 16, marginTop: 16, fontWeight: "600" },
  loadingSubtext: { color: "#333", fontSize: 12, marginTop: 8, textAlign: "center" },
  progressBar: { width: "100%", height: 3, backgroundColor: "#111", borderRadius: 2, marginTop: 12, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#00c853", borderRadius: 2 },
  emptyState: { alignItems: "center", marginTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 24, fontWeight: "700", color: "#fff", marginBottom: 8 },
  emptyText: { fontSize: 13, color: "#444", textAlign: "center", lineHeight: 20 },
  chips: { marginTop: 24, width: "100%", gap: 8, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  chip: { backgroundColor: "#0d1f0d", borderWidth: 1, borderColor: "#1a4d1a", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { color: "#00c853", fontSize: 13 },
  bubble: { marginBottom: 12, padding: 14, borderRadius: 16, maxWidth: "88%" },
  userBubble: { backgroundColor: "#0a1628", alignSelf: "flex-end", borderWidth: 1, borderColor: "#1a3a6a" },
  aiBubble: { backgroundColor: "#050f05", alignSelf: "flex-start", borderWidth: 1, borderColor: "#0d3d0d", minWidth: 80 },
  roleLabel: { fontSize: 9, color: "#00c853", fontWeight: "700", marginBottom: 6, letterSpacing: 1.5 },
  bubbleText: { color: "#e8e8e8", fontSize: 15, lineHeight: 24 },
  inputArea: { borderTopWidth: 1, borderTopColor: "#111", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  disclaimer: { fontSize: 10, color: "#222", textAlign: "center", marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, backgroundColor: "#0d0d0d", color: "#fff", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: "#1a1a1a" },
  sendBtn: { width: 44, height: 44, backgroundColor: "#00c853", borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: "#0a1a0a" },
  sendIcon: { fontSize: 20, color: "#000", fontWeight: "bold" },
});
