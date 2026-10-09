# Better xCloud — tratamento experimental v7

Userscript Windows/Chrome/Tampermonkey baseado no Better xCloud 6.7.12 fornecido em `script.js`. O original foi preservado. A integração anterior foi confirmada pelo diagnóstico magenta no Dell; o tratamento anterior não trouxe ganho perceptível.

## Instalar

1. Desative outras versões do Better xCloud no Tampermonkey. Não execute duas juntas.
2. Substitua todo o conteúdo do script experimental por `better-xcloud-image-filter.user.js`, salve e recarregue o xCloud.
3. Mantenha resolução **1080p HQ**, qualidade **Alta**, bitrate **Ilimitado** e renderizador **WebGL2**.
4. Abra **Tratamento de imagem • v7** no menu do Better xCloud, na seção **Vídeo**, logo após **Nitidez**.
5. Compare **CAS em 2** e **Novo tratamento** na mesma cena. **Vídeo original** desliga o tratamento e a nitidez.

A v6 usa o controle nativo **Nitidez** (0–10), a seleção AMD CAS/USM e o modo Performance/Qualidade do Better xCloud no **Novo tratamento**. Comece com AMD CAS em 2 e aumente aos poucos. Há uma única etapa de nitidez após o tratamento e o upscale. **Referência: CAS em 2** continua fixa em 2 para comparação; **Vídeo original** não aplica nitidez.

Compressão, degradês, temporal, upscale e diagnóstico ficam no mesmo menu. Os controles experimentais de saturação, contraste e sombras foram removidos; valores antigos dessas correções são neutralizados. O tratamento é salvo para todos os jogos; nitidez segue as preferências nativas do Better xCloud, inclusive perfis por jogo. A v6 também reinicia o tipo do renderizador ao encerrar a sessão para recriar o canvas no jogo seguinte e impede que uma inicialização assíncrona reative um motor já encerrado.

As configurações experimentais usam uma nova chave de armazenamento, sem importar os valores de 100% dos testes anteriores. Atualização oficial automática fica desativada nesta distribuição.

## Controles

| Controle | Efeito |
| --- | --- |
| Compressão | Suaviza pequenos saltos entre regiões uniformes, preservando bordas fortes. Não é reconstrução por IA. |
| Degradês | Suaviza faixas com amostragem até 8 pixels, seguida de dithering discreto. |
| Estabilidade em movimento | Tratamento temporal experimental: estima deslocamentos até aproximadamente 40 pixels usando quadros anteriores. Rejeita correspondências ruins e cortes. |
| Resolução de saída | Nativa (1080p quando essa for a fonte), 2K/1440p ou 4K/2160p. Mantém a proporção da fonte; os tamanhos indicados assumem 16:9. FSR 1 EASU amplia quando a saída supera a fonte, independentemente do tamanho da janela. |
| Antialiasing | Suavização direcional de bordas inclinadas após o temporal e antes do upscale/nitidez. Inicia desligado; experimente 25–50%. Não é MSAA/TAA do jogo. |
| Tratamento na GPU | Adaptar acima de 3, 6 ou 10 ms, ou manter todos os filtros ativos sem redução automática. |

Valores iniciais: compressão 35%, degradês 30%, temporal **desligado**, contraste/saturação 100%, sombras 0%. Experimente temporal em 20–40% e compare giros de câmera. Durante movimentos grandes, a etapa temporal pode rejeitar todo o histórico: isso protege contra rastros, mas limita o ganho.

**Diagnóstico: colorir imagem** confirma execução pela tonalidade magenta. **Restaurar tratamento** também reinicia o histórico e a adaptação de desempenho. Abra o menu de vídeo também durante tela cheia.

## Desempenho e limites

O painel informa quadros, cadência e, quando disponível, tempo GPU total no percentil 95. A medição GPU inclui upload e todos os passes: é um limite conservador, não uma medição isolada de custo adicional. Acima do limite escolhido (3 ms por padrão) sustentado, desativa temporal primeiro e reduz degradês em seguida. **Manter todos os filtros ativos** mantém os valores selecionados, mesmo com tempo GPU alto ou cadência baixa. Todo o processamento dos pixels já ocorre na GPU via WebGL2; essa opção não aumenta o clock nem altera a GPU escolhida pelo Chrome. Não desativa automaticamente o upscale ou a correção de compressão; se houver queda restante, escolha CAS em 2.

Sem timers GPU, a adaptação compara cadência com um trecho previamente medido em CAS/original. Sem essa referência, informa apenas cadência. Uma redução maior que 5% por três janelas de dois segundos reduz os mesmos tratamentos. Não confundir isso com medição de latência dos controles.

O filtro processa quadros novos e não aguarda quadros futuros. Não controla o bitrate enviado pelo servidor, não recupera garantidamente texturas apagadas e não implementa FSR temporal de jogos nem IA. A seleção de saída chega a 2160p. Forçar 4K usa quatro vezes mais pixels que 1080p em várias etapas e pode reduzir a fluidez. Se o Windows enviar sinal de 1080p para a TV, o resultado 4K será reduzido para esse sinal; o userscript não muda a resolução do Windows/HDMI. Para exibir 4K físico, configure a saída do Windows em 3840×2160, se suportada pelo equipamento e conexão.

## Player para testes com vídeo

O player usa **o mesmo motor** do userscript. Abra um vídeo local, pause numa cena e alterne os modos; exporte o quadro para comparação. É possível usar arquivos de vídeos do YouTube obtidos com autorização, mas não URLs do site nem players incorporados: acesso à textura pode ser restringido por origem.

```sh
python3 tools/build.py
python3 -m http.server 8765 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8765/player/`. Os dois lados usam o mesmo elemento de vídeo, portanto não há divergência entre instantes.

```sh
python3 tools/make-test-videos.py
```

Requer FFmpeg com libx264. Gera `output/videos/reference.mp4` e versões com alvos de 5, 15 e 20 Mbps. A referência é H.264 de alta qualidade (CRF 10), **não lossless**; a cena é sintética, não Hellblade. Os alvos são limites do encoder e a taxa real pode ficar abaixo deles em cenas simples. Os arquivos foram gerados nesta sessão e podem ser usados imediatamente.

## Verificação

```sh
node --test tests/*.cjs
node --check better-xcloud-image-filter.user.js
python3 tools/browser-harness.py
```

Com o servidor acima, abra `/output/playwright/filter-harness.html`. Testa shaders reais, modos, degradês, limites de halo, corte, preto, upscale, diagnóstico e liberação de recursos. O player permite validar reprodução de vídeo, exportação e ajustes.

Consulte `docs/validation-v3.md` para os resultados e as pendências. Mudança em pixels não comprova melhora visual. A aprovação de ganho em Hellblade e teste de pelo menos dez minutos no Dell continuam necessários; não há evidência para prometer que essa versão resolve o problema.

Use o [roteiro de comparação no Dell](docs/teste-dell.md) para registrar os três modos na mesma sessão.

## Fontes e licenças

- Better xCloud: https://github.com/redphx/better-xcloud — MIT, redphx.
- FSR 1: https://github.com/GPUOpen-Effects/FidelityFX-FSR — MIT, AMD. Fonte original vendorizada em `src/vendor/ffx_fsr1.h`; port GLSL em `src/shaders/easu.glsl`, com licença preservada. Usa reciprocais exatos e emulação de textureGather por texelFetch no WebGL2.
- libplacebo: https://github.com/haasn/libplacebo — referência conceitual de debanding; nenhum código foi copiado. O debanding implementado é próprio.

Não adicionar sharpening de outro aplicativo sobre o resultado sem compará-lo isoladamente. Para retornar à versão oficial, desative este script e reative o original.

## Verificação de movimento v4

`python3 tools/quality-harness.py` gera `/output/playwright/motion-quality.html`. Compara erro em textura não periódica limpa e ruidosa, usando a mesma etapa de nitidez, em deslocamentos de 0, 4, 8, 16 e 32 pixels por quadro. É um teste de redução de ruído em movimento, não uma prova de recuperação de detalhes descartados pelo xCloud.

## Teste com imagens reais de Hellblade

Foi usado um trecho curto do trailer oficial Xbox (`https://www.youtube.com/watch?v=3VYGOkMnGCE`), disponibilizado publicamente. Referência 4K reduzida para 1080p e uma versão H.264 CRF32 com teto de 5 Mbps. A taxa efetiva dessa amostra foi 0,407 Mbps: não é uma reprodução exata do seu stream de 5 Mbps. `tools/gameplay-harness.py` gera uma comparação de luminância e bordas sobre os arquivos locais correspondentes. Quadros pretos são excluídos e a medição exige ao menos oito quadros visíveis. Não há download automático no userscript.

Em 23 quadros desse trecho, o tratamento espacial teve menor erro que CAS em 2; o temporal acrescentou ganho muito pequeno e maior custo. Por isso permanece desligado por padrão. A v5 evita duas cópias de históricos usando buffers alternados. Veja o registro de validação para números e limitações.
