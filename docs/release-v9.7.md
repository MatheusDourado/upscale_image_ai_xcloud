# v9.7 — captura direta, tratamento que segue a compressão, painel novo e HUD

Userscript `6.7.12-imagefilter.9.7` e app Android **9.7**.

Prioridades desta versão, na ordem pedida: **fluidez**, **nitidez** e **tratamento de imagem**, com um painel redesenhado e indicadores para acompanhar durante o jogo.

## Fluidez

- **Captura direta (experimental).** Com a Fluidez ligada, a opção *Quadros: direto do decodificador* lê cada quadro decodificado da trilha WebRTC (`MediaStreamTrackProcessor`), em vez do elemento `<video>`. O vídeo exibe no máximo um quadro por atualização da tela: quadros que chegam juntos (comum em 5G) são descartados antes do tratamento.
  - **WebRTC real no Chromium**, com quadros chegando em pares a 3 ms um do outro: pelo vídeo chegaram ao tratamento 46–47 de ~80 quadros; pela captura direta, todos.
  - Cada `VideoFrame` é tratado numa textura do compassador e fechado na hora, então o decodificador de hardware nunca espera.
  - Respeita o limite de FPS do Better xCloud e pausa com a aba em segundo plano.
  - **Volta sozinha ao vídeo, com o motivo no painel**, se o navegador não tiver o recurso, se não chegar quadro em 2 s ou se a GPU recusar os primeiros quadros.
- **Compassador:** cada origem tem seu relógio. Trocar entre vídeo e captura direta, ou um salto de tempo acima de 1 s, reinicia o estado. Antes, trocar a origem no meio da sessão deixava todo quadro em +3 ms, ou seja, a Fluidez desligada sem aviso (achado da revisão adversarial).

## Nitidez e tratamento

- **Adaptar à compressão (ligado):** limpeza de blocos, degradês e detalhe seguem o **QP** médio do H.264 (nível de compressão do stream, lido do WebRTC), como o filtro de deblocking de um codec.
  - No QP 28 tudo fica igual à v9.
  - Stream limpo (QP ≤ 20): limpeza ×0,6 e detalhe ×1,2. Stream muito comprimido (QP ≥ 36): limpeza ×1,4 e detalhe ×0,8.
  - Média ponderada pelos quadros e histerese de dois passos, para não oscilar. Recomeça a cada sessão.
- **Perfis:**
  - *Natural*: padrão medido da v9.
  - *Console*: Nitidez 2, menos cintilação.
  - *Nítido*.
  - *Bitrate baixo*: mais limpeza.
  - *Leve*: menos GPU, saída nativa.
- **Nitidez pelo controle:** o Better xCloud ajusta sliders com `parseInt(step)`, e o slider antigo (passo 0,5) não mudava pelo D-pad.

## Painel e HUD

(ver seção da interface)

## Diagnóstico

- Telemetria compartilhada, uma vez por segundo, só quando o painel, o HUD ou a adaptação precisam: codec, FPS recebidos, decodificador, RTT, buffer, decodificação, bitrate, perda de pacotes, QP, quadros perdidos e congelamentos.
- **Avisos automáticos:** renderizador diferente de WebGL2, bitrate limitado, resolução abaixo de 1080p, stream abaixo de 1080p, decodificação por software, perda de pacotes acima de 1% e saída acima da tela.
- **App Android:** *Encerrar e exportar medição* agora salva o JSON em `Downloads/xCloud ImageFilter`, e *Copiar configuração* usa a área de transferência do sistema.
- **Medição:** voltar a uma configuração (por exemplo, um nível de QP já visto) continua o mesmo segmento, e o limite de 256 configurações aparece como motivo da parada.

## Validação

(preencher)
