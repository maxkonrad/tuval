---
title: "Tasks: JSON-SPICE Transpiler & Web Circuit Analyzer"
date: 2026-05-03
source_prd: "[[prd]]"
status: active
---

## 1. [x] Core JSON-SPICE Transpiler
**Stories:** 2, 6
**TDD:** yes
### What to build
JSON şemasını (id, type, x, y, connections) okuyup geçerli bir SPICE netlist string'i üreten tamamen izole, saf (pure) bir modülün yazılması ve birim testlerinin (dangling node vb.) eklenmesi.
### Acceptance criteria
- [ ] JSON objesini alıp geçerli bir SPICE netlist string'i döndüren bir fonksiyon yazılması.
- [ ] Dangling node veya hatalı bağlantılar durumunda anlamlı hatalar fırlatılması.
- [ ] Fonksiyonun birim testlerinin yazılması ve geçmesi.

## 2. [x] ngspice Execution Runner
**Stories:** 4
**TDD:** no (integration)
### What to build
Hazır bir SPICE string'ini alıp ngspice motoruna (WASM veya batch API) gönderen ve dönen raw simülasyon sonuçlarını parse edip yapısal bir veriye çeviren modülün geliştirilmesi.
### Acceptance criteria
- [ ] Verilen SPICE string'inin ngspice motorunda hatasız çalıştırılması.
- [ ] ngspice'dan dönen raw metin çıktısının ayrıştırılarak grafik çizimi için uygun yapısal bir veri formatına dönüştürülmesi.
- [ ] Hatalı SPICE string'i gönderildiğinde motorun hata durumunu yönetmesi.

## 3. [ ] Circuit Canvas UI (JSON Export/Import)
**Stories:** 1, 2
**TDD:** no (UI)
### What to build
Kullanıcıların devre elemanlarını sürükleyip bırakabileceği, bağlantıları çizebileceği web tabanlı arayüzün oluşturulması ve bu görsel durumun JSON formatında dışa aktarılması/yüklenmesi işlevlerinin eklenmesi.
### Acceptance criteria
- [ ] Temel devre elemanlarının eklenebildiği ve bağlanabildiği interaktif bir canvas arayüzü oluşturulması.
- [ ] Çizilen devrenin "id, type, x, y, connections" içeren JSON formatında dışa aktarılabilmesi.
- [ ] Aynı formatta bir JSON dosyasının yüklenerek canvas üzerinde görselleştirilebilmesi.

## 4. [ ] Advanced `spice_params` Support
**Stories:** 3
**TDD:** yes
### What to build
Transpiler modülünün `spice_params` objesini okuyup `KEY=VALUE` formatında SPICE çıktısına ekleyecek şekilde genişletilmesi ve UI tarafında komponentlere gelişmiş parametre ekleme desteğinin sağlanması.
### Acceptance criteria
- [ ] Transpiler'ın bileşenlerdeki `spice_params` sözlüğünü okuyarak `KEY=VALUE` (örn. `W=1u L=0.5u`) stringlerine çevirebilmesi.
- [ ] UI üzerinde kullanıcıların seçili bileşene key/value çiftleri ekleyebileceği bir arayüz bileşeninin oluşturulması.

## 5. [ ] E2E Simulation & Plotting UI
**Stories:** 4, 5, 6
**TDD:** no (UI integration)
### What to build
"Simüle Et" butonunun UI'a eklenmesi, canvas'taki devrenin anlık olarak Transpiler'dan (Task 1) geçirilip ngspice Runner'a (Task 2) gönderilmesi ve dönen sonuçların interaktif bir grafik (plot) kütüphanesiyle UI'da gösterilmesi.
### Acceptance criteria
- [ ] "Simüle Et" butonuna basıldığında Transpiler ve ngspice Runner'ın ardışık şekilde tetiklenmesi.
- [ ] Simülasyon sonuçlarının yüksek çözünürlüklü ve interaktif bir grafik bileşeninde (plot) gösterilmesi.
- [ ] Canvas güncellendiğinde arka planda (veya istek üzerine) sürecin yenilenebilir olması.
