# API `window.BxImageFilter` (painel e HUD)

`src/image-filter.js` (adaptador) renderiza, mede e publica o estado. `src/panel.js` (painel no menu de vídeo do Better xCloud) e `src/hud.js` (indicadores durante o jogo) só leem e alteram o estado por esta API. O `tools/build.py` concatena os três arquivos, nessa ordem, no userscript.

## Configurações — `api.settings`

Objeto vivo, normalizado por `BxRestoration.normalize` (`src/restoration-engine.js`). Para alterar, use `api.update(patch)`: ele salva e reinicia a adaptação de GPU quando a mudança afeta a imagem.

| Chave | Valores | Uso |
| --- | --- | --- |
| `mode` | `original`, `cas`, `filtered` | Comparação: vídeo original, referência só nitidez, novo tratamento |
| `sharpness` | 0–10, passo 0,5 | Nitidez (USM/CAS/RCAS) |
| `sharpening` | `usm`, `cas`, `rcas`, `native` | Método da nitidez final |
| `cleanup`, `deband`, `chroma`, `detail`, `temporal`, `antialias`, `neural` | 0–1 | Compressão, Degradês, Cor nas bordas, Detalhe, Estabilidade em movimento, Antialiasing, Reconstrução neural |
| `adaptive` | booleano | Adaptar limpeza/degradês/detalhe à compressão (QP) |
| `output` | `auto`, `native`, `1440`, `2160` | Resolução de saída |
| `fluidity` | `off`, `balanced`, `max` | Fluidez (ritmo de exibição) |
| `capture` | `video`, `direct` | Origem dos quadros com Fluidez ligada: elemento de vídeo ou direto do decodificador |
| `smoothing` | 0, 17, 33, 50 | Suavidade (alvo do buffer WebRTC, ms) |
| `gpuBudget` | 0, 3, 6, 10 | Adaptar acima de N ms (0 = manter tudo) |
| `spatialMode` | `selective`, `legacy` | Limpeza espacial |
| `hud` | `off`, `compact`, `full` | Indicadores durante o jogo |
| `hudPosition` | `top-left`, `top-right`, `bottom-left`, `bottom-right` | Canto do HUD |

## Ações

- `api.update(patch)`, `api.reset()` (restaura o tratamento; mantém o HUD), `api.applyPreset(key)`, `api.preset()` → chave do perfil atual ou `custom`.
- `api.presets`: `{natural, console, sharp, clean, light}`, cada um com `{label, description, values}`.
- `api.diagnostic` (booleano, não salvo): colore a imagem para confirmar que o tratamento roda.
- `api.startMeasurement()` → `Promise<boolean>`; `api.measuring`; `api.exportMeasurement()` → baixa o JSON e devolve o relatório.
- `api.configText()` → JSON para "Copiar configuração".
- `api.copyText(text)` → `Promise<boolean>`: copia pela ponte do app Android ou pelo clipboard do navegador.
- `api.nativePref(key)`: lê preferências do Better xCloud.
- `api.panelOpen`: o painel marca `true` enquanto está visível (liga a telemetria).
- `api.active`: há quadros tratados nos últimos 2,5 s.
- `api.directSupported()`: o navegador permite a captura direta.
- `window.BxAndroid` (só no app): `getRefreshRates()` (JSON), `getRefreshRate()`, `setRefreshRate(hz)`, `getAppInfo()`, `copyText(text)` e `saveFile(nome, mime, texto)` (Downloads/xCloud ImageFilter; usada pela exportação da medição). Só respondem com a página no xbox.com.

## Estado — `api.status` (atualizado a cada quadro e a cada segundo)

- `mode` (`waiting`, `ready`, `filtered`, `cas`, `original`, `diagnostic`, `error`), `error`, `frames`, `lastFrame` (Date.now), `resolution` (`"1920×1080 → 2276×1280"`), `display` (altura física do vídeo na tela), `fps`.
- `gpuP95` (ms ou `null`), `measurement` (`gpu` ou `cadence`), `adaptation` (motivo da última redução automática).
- `pacing` — ritmo na tela (2 s): `{meanMs, deviationMs, p95Ms, hitches, frames}`.
- `intervals` — intervalos entre quadros exibidos (ms), últimos 240, para gráficos.
- `origin` — `{server, arrival}` (como `pacing`), `presented`, `missed` (quadros pulados antes do tratamento em 2 s).
- `fluidity` — `{mode, extraMs, dropped}` ou `null`.
- `capture` — `{active, frames, reason}`: captura direta em uso, quadros recebidos dela, motivo de fallback.
- `smoothing` — `{requestedMs, state, ...}` (`waiting`, `unsupported`, `requested`, `partial`, `error`).
- `net` — `{codec, profile, fpsReceived, decoder (hardware|software|unknown), implementation, decodeMs, bufferMs, rttMs, bitrateMbps, lossPct, qp, framesDropped, freezes, width, height}` ou `null`.
- `adaptive` — `{qp, qpMean, level (0–1), scales:{cleanup, deband, detail}}` ou `null`.
- `warnings` — lista `{level: 'error'|'warn'|'info', key, text}` (renderizador, bitrate limitado, resolução, decodificação por software, perda de pacotes, saída acima da tela, erro do motor).
