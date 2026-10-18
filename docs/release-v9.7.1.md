# v9.7.1 — compressão sem QP, GPU estimada e medição com ritmo

Userscript `6.7.12-imagefilter.9.7.1` e app Android **9.7.1**.

## Origem

Primeira medição num aparelho real: Poco F7 (Android 16, WebView Chrome 155) com o xCloud real, jogando *Gears of War: E-Day*, captura direta e Fluidez Equilibrada.

- **O que funcionou:**
  - captura direta: 4.659 de 4.662 quadros decodificados chegaram à tela;
  - rede: 20 ms de ida e volta e 0,008% de perda;
  - exportação para Downloads/xCloud ImageFilter.
- **O jogo veio a 30 FPS do servidor** durante a partida. Nos menus, veio a ~60.
- **O que a medição revelou:**
  1. O WebView do Android não informa o QP (`qpSum`). O *Adaptar à compressão* ficou parado, e o painel, em "Aguardando o QP do stream…".
  2. Sem cronômetro de GPU (`EXT_disjoint_timer_query_webgl2`), não havia tempo de GPU no painel nem na medição.
  3. A medição só trazia o FPS médio. Não dava para saber se os 30 FPS saíram estáveis na tela.

## Compressão estimada pela taxa de bits

- Sem QP, *Adaptar à compressão* usa os **bits por pixel** de cada quadro: bytes recebidos × 8 / (quadros × largura × altura).
- 0,12 bit/pixel (15 Mb/s em 1080p60, o meio dos streams de calibração da v9) equivale ao QP 28 neutro. Cada dobro equivale a 4 QP a menos. O H.264 precisa de cerca de 6 por dobro; a inclinação menor mantém perto do neutro uma estimativa que não enxerga o conteúdo da cena.
- Usa o **percentil 80 do último minuto**. Uma cena parada gasta poucos bits com QP baixo e não é lida como compressão forte.
  - Segundos com menos de 10 quadros (travadas) ficam de fora.
  - A primeira estimativa sai após 5 s, com a mesma histerese do QP.
- O painel mostra "Estimado pela taxa de bits (sem QP neste aparelho): 0,18 bit/pixel ≈ QP 26 · nível 0,3". Antes da primeira estimativa, mostra "Este aparelho não informa o QP: estimando pela taxa de bits…". Em *04 Desempenho e rede*, o QP aparece como "≈26 (pela taxa de bits)", nunca como leitura real.
- Com os números dessa sessão (9 Mb/s em 1080p30, ~0,15–0,18 bit/pixel), o stream é lido como pouco comprimido: um pouco menos de limpeza e um pouco mais de detalhe.

## Tempo de GPU estimado

- Sem cronômetro de GPU, um *fence* a cada 0,5 s mede **do início dos comandos de um quadro até a GPU concluí-lo**.
- É um limite superior, porque inclui o trabalho que já estava na fila. Serve só para exibição: a redução automática continua pela cadência.
- No painel: "≈X ms de 33 ms por quadro". A classificação é boa até um intervalo de quadro e ruim acima de dois: a GPU processa quadros sobrepostos, então um quadro pode levar mais que o intervalo sem perder FPS.
- O valor também entra na latência estimada por etapa.

## Medição com ritmo (`schema: 2`)

Formato completo em [api-imagefilter.md](api-imagefilter.md#medição--relatório-de-apiexportmeasurement-schema-2).

- **Por configuração**, intervalos entre quadros:
  - **exibidos** (`display`);
  - **chegando ao tratamento** (`arrival`);
  - **capturados no servidor** (`server`);
  - mais a **espera da Fluidez** (`wait`) e os descartes.

  Cada série tem média, p50/p95/p99, máximo, desvio, tremidas e as amostras.
- **Linha do tempo por segundo:**
  - FPS recebido e exibido;
  - Mb/s, perda e RTT;
  - decodificação e buffer;
  - QP ou bits por pixel e nível da adaptação;
  - GPU, espera e captura.
- **Metadados:**
  - método de GPU (`timer`/`fence`);
  - tela e taxa de atualização medida;
  - preferências do Better xCloud;
  - versão do app;
  - estado da captura e da Suavidade.

  O estado final inclui o ritmo, a origem e os avisos.
- Na captura direta, o painel passa a ler o ritmo do servidor e da chegada pelos próprios quadros (timestamps do `VideoFrame`). Antes vinha do elemento de vídeo, que não vê os quadros que chegam juntos. Ao trocar entre vídeo e captura direta, as janelas recomeçam, sem misturar relógios.
- A telemetria também roda durante a medição, mesmo com painel, HUD e adaptação desligados.

## Validação

<!-- VALIDATION -->
