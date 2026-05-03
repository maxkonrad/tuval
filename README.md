# Tuval⚡

Web tabanlı, görsel layout verisini ve SPICE mantığını tek bir JSON dosyasında birleştiren modern bir devre analiz platformu.

## Özellikler

- 🎨 **İnteraktif Devre Çizim Alanı** — Elemanları sürükle-bırak ile yerleştirin, portlardan kablo çizin
- 📄 **JSON Import/Export** — Devreleri görsel konumlarıyla birlikte paylaşın
- ⚡ **JSON → SPICE Transpiler** — Görsel devre JSON'ını otomatik olarak SPICE netlist'ine çevirir
- 🔬 **ngspice Simülasyonu** — "Simüle Et" butonuyla batch simülasyon çalıştırın
- 📺 **70'ler CRT Osiloskop** — Sonuçları fosfor yeşili ışımalı retro osiloskop ekranında görüntüleyin
- 🔧 **Gelişmiş SPICE Parametreleri** — `spice_params` ile `KEY=VALUE` formatında esnek parametre desteği

## Hızlı Başlangıç

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
npm run dev
```

## Mimari

```
src/
├── main.ts              # UI mantığı, canvas, simülasyon pipeline
├── transpiler.ts         # JSON → SPICE netlist transpiler (pure, izole)
├── ngspiceRunner.ts      # ngspice motor arayüzü ve çıktı ayrıştırıcı
├── style.css             # Koyu tema + CRT osiloskop stilleri
├── transpiler.test.ts    # Transpiler birim testleri
└── ngspiceRunner.test.ts # Runner birim testleri
```

## JSON Şeması

```json
{
  "title": "My Circuit",
  "components": [
    {
      "id": "V1",
      "type": "V",
      "value": "5V",
      "x": 100,
      "y": 200,
      "connections": ["node1", "0"],
      "spice_params": { "AC": "1" }
    }
  ]
}
```

## Testler

```bash
npx vitest run
```

## Teknolojiler

- **Vite** + **TypeScript** — Hızlı geliştirme ortamı
- **Vitest** — Birim testleri
- **Vanilla DOM + SVG** — Hafif, framework'süz UI
- **Canvas 2D** — CRT osiloskop görselleştirmesi
- **ngspice** — SPICE simülasyon motoru (WASM/backend)

## Lisans

[MIT](LICENSE)
