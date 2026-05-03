---
title: "JSON-SPICE Transpiler & Web Circuit Analyzer"
date: 2026-05-03
status: draft
---

## Problem Statement

Mevcut devre simülatörleri ya (Falstad gibi) web tabanlı olup basit oyuncaklar seviyesindedir ya da (LTspice, ngspice gibi) son derece güçlü ancak masaüstüne bağımlı, eski nesil arayüzlere ve dosya formatlarına sahiptir. Elektronik mühendisleri ve öğrenciler, hem web üzerinden anında erişilebilecek modern bir arayüze hem de karmaşık analizleri çalıştırabilecek gerçek bir simülasyon motorunun gücüne aynı anda ihtiyaç duymaktadır. Dosya paylaşımı ve otomasyon için ise geleneksel metin tabanlı SPICE netlistleri görsel düzen verisi (layout) içermediğinden web çağının standartlarına uygun değildir.

## Solution

Web tabanlı, görsel layout verisini ve SPICE mantığını tek bir JSON dosyasında (wrapper) birleştiren modern bir devre analiz platformu. Kullanıcılar devreyi web arayüzünde çizer, sistem bu görsel devrenin arkasındaki mantığı JSON'dan anlık olarak SPICE netlist'ine transpile eder (dönüştürür) ve ngspice (WASM veya backend) motorunu batch modda çalıştırarak kullanıcılara profesyonel dalga boyu grafiklerini (plot) sunar. Formatın katı şemasından kaçınmak için karmaşık parametreler esnek bir sözlük (dictionary) üzerinden ngspice'a aktarılır.

## User Stories

1. As a devre tasarımcısı, I want to devre elemanlarını web arayüzüne sürükleyip bırakabilmek, so that hızlıca topolojimi çizebilirim.
2. As a devre tasarımcısı, I want to şematik dosyamı JSON formatında indirebilmek ve yükleyebilmek, so that tasarımlarımı başkalarıyla kolayca paylaşabilirim (görsel konumlarıyla birlikte).
3. As an ileri seviye kullanıcı, I want to karmaşık SPICE modellerini (örn. BSIM4) `spice_params` sözlüğüne key/value olarak ekleyebilmek, so that JSON şeması beni kısıtlamadan ngspice'ın tam gücünü kullanabileyim.
4. As a mühendis, I want to "Simüle Et" butonuna basarak LTspice benzeri bir batch simülasyon çalıştırabilmek, so that karmaşık analizleri (Transient, AC, DC) gerçekleştirebileyim.
5. As a mühendis, I want to simülasyon sonuçlarını yüksek çözünürlüklü ve interaktif grafikler (plot) halinde görebilmek, so that sinyal gecikmelerini ve tepe noktalarını inceleyebileyim.
6. As a sistem, I want to kullanıcı devreyi güncellediğinde arkada otomatik bir JSON -> SPICE transpiler'ı çalıştırmak, so that ngspice motoru için her zaman geçerli bir netlist hazır olsun.

## Implementation Decisions

- **Ana Veri Yapısı:** Tüm uygulamanın 'source of truth'u JSON objesidir. SPICE dosyaları bu JSON objesinden transpile edilerek türetilir.
- **Esnek Parametreler:** JSON şeması sadece ana bileşenleri (id, type, x, y, connections) zorunlu tutar. SPICE özel parametreleri `spice_params` objesinde tutulur ve transpiler bunları `KEY=VALUE` string'i olarak çevirir.
- **Simülasyon Motoru:** ngspice kullanılacak. Tercihen istemci tarafında WASM olarak veya bir backend servisinde batch process (toplu işlem) olarak çalıştırılacak. Falstad benzeri 60fps frame-by-frame simülasyon yerine, işi gönder-sonucu bekle mimarisi kurulacak.
- **Transpiler Modülü:** JSON alıp SPICE formatında netlist string'i üreten saf ve izole bir modül yazılacak. Bu modül UI'dan tamamen bağımsız test edilebilecek.

## Testing Decisions

- **Transpiler Testleri:** JSON input'ları verilip beklenen SPICE string'i çıktısını doğrulayan birim (unit) testleri yazılmalıdır.
- **Bütünlük Testi (Integration):** Örnek bir R-C low-pass filter JSON'ı transpiler'a sokulup, oradan ngspice'a gönderilip, dönen sonucun beklenen frekans yanıtını verip vermediği kontrol edilmelidir.
- **Hata Yönetimi Testleri:** JSON'da bir component silindiğinde ancak bağlantıları başka komponentlerde kaldığında (dangling nodes) sistemin anlamlı bir hata fırlatıp fırlatmadığı test edilmelidir.

## Out of Scope

- Anlık güncellenen animasyonlu UI devresi (Falstad benzeri interaktif simülasyon).
- PCB tasarım özellikleri veya gerber çıktısı alma.
- Simülasyon motorunu sıfırdan JS/TS ile yazmak.
