# MediSense

Private offline Android medical symptom screener powered by MedPsy-1.7B via QVAC SDK.

## Hardware
- Device: Android 12, Snapdragon 855, Adreno 640, 6GB RAM
- Inference: CPU only, ~2.5 TPS, ~4.1s TTFT

## Setup
1. Install APK from EAS build
2. First launch downloads MedPsy-1.7B-GGUF (1.28GB) from HuggingFace
3. All inference runs offline after that

## Remote APIs
```json
[
  {
    "service": "HuggingFace",
    "url": "https://huggingface.co/qvac/MedPsy-1.7B-GGUF",
    "purpose": "One-time model download on first launch only",
    "frequency": "Once per install"
  }
]
```

## Tracks
- Mobile
- Psy Models (MedPsy-1.7B)

## Stack
- QVAC SDK (@qvac/sdk)
- Expo + React Native
- EAS cloud build
- Built entirely in Termux on Android
