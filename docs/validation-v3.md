# Validação da versão 6.7.12-imagefilter.3

2026-10-09. Implementação realizada sobre script.js (Better xCloud 6.7.12).

## Resultado técnico

- Sete testes Node passaram: configurações, histórico, adaptação GPU, isolamento de referência e adaptação por cadência.
- Verificação de sintaxe passou para userscript e player.
- Vinte e duas verificações no Chrome/WebGL2 passaram, incluindo redução do salto numa borda sintética de compressão, alteração de degradês, estabilidade de preto, corte de cena, FSR, diagnóstico, descarte de recursos e integração com refreshPlayer do Better xCloud.
- O player carregou e reproduziu o arquivo H.264 de 5 Mbps em 1920×1080/60. Tempo GPU total p95 observado nesta execução curta no Mac: aproximadamente 2,14 ms. Não é benchmark do Dell nem de latência completa.
- A exportação do quadro PNG funcionou. Evidência: output/playwright/exported-frame.png.
- FFprobe confirmou 1920×1080, 60 FPS nas quatro amostras. Bitrates médios: referência CRF10 15,31 Mbps; alvos 5/15/20 Mbps resultaram em 4,87/14,60/19,49 Mbps.

## Decisões de implementação

- Temporal inicia desligado: não há ainda evidência de ganho perceptível sem rastros em Hellblade. Está implementado e testável pelo controle.
- O budget GPU usa tempo total como limite conservador de 3 ms, incluindo upload/CAS, em vez de atribuir com falsa precisão apenas o custo adicional. A referência não reduz os efeitos.
- Sem timers, adaptação exige referência de cadência medida no mesmo vídeo, resolução e continuidade. Referência é invalidada em pausa/seek, nova fonte e mudança de dimensões; o adaptador também invalida ao trocar o alvo de FPS.
- Debanding é uma implementação própria; libplacebo serviu como referência conceitual. Nenhum código LGPL foi incorporado.
- A amostra sintética é reproduzível e gerada localmente; não foi baixado gameplay do YouTube. Referência CRF10 é de boa qualidade, não lossless. Ela não permite concluir ganho visual em Hellblade.

## Revisão independente e correções

A revisão identificou mistura de medições de referência com tratamento, reset incompleto da adaptação, programa GL errado após render e referência de cadência obsoleta. Esses pontos foram corrigidos. Foram acrescentadas verificações de regressão para isolamento da referência, reset do budget e atualização das configurações originais.

## Pendências para aceitação no aparelho

1. Comparar CAS em 2 e novo tratamento na mesma cena de Hellblade, com câmera parada e girando. Avaliar rostos, cabelo, roupas, sombras e textos.
2. Testar temporal em 20–40% e verificar rastros durante movimentos rápidos e cortes. Uma busca com correspondência ruim deve reduzir seu aproveitamento.
3. Medir pelo menos dez minutos no Dell, usando o mesmo trecho e resolução. A queda de cadência deve ficar abaixo de 5% frente ao CAS.
4. Validar fullscreen e sessão real de xCloud no Windows. Aqui a integração foi exercitada com o renderizador upstream e uma fonte sintética, sem sessão autenticada do serviço.

A implementação está disponível para teste. Os critérios de ganho visual em Hellblade e desempenho sustentado no Dell **não foram comprovados**. Não interpretar compilação ou mudança de pixels como evidência de reconstrução de texturas perdidas.

## Continuação: versão 6.7.12-imagefilter.4

A busca temporal foi ampliada: busca fina local, busca grosseira até 32 pixels da fonte e refinamento até aproximadamente 40 pixels. O campo de movimento usa amostragem nearest e decodificação arredondada para não misturar vetores de regiões diferentes nem introduzir deslocamento fracionário pela quantização RGBA8.

Foi criado `tools/quality-harness.py`, que usa uma textura de blocos não periódica com movimento conhecido e ruído determinístico de ±4 níveis. A referência é a textura limpa com a mesma etapa de nitidez. Temporal foi testado em 100%, com as outras correções espaciais desligadas, para isolar sua contribuição. Cada caso mede 25 quadros após aquecimento.

| Deslocamento por quadro | Redução de erro MSE com temporal |
| --- | --- |
| 0 pixels | 30,25% |
| 4 pixels | 31,27% |
| 8 pixels | 31,43% |
| 16 pixels | 31,54% |
| 32 pixels | 27,24% |

A versão anterior reduzia apenas 0,88% nesse mesmo caso de 16 pixels por quadro. O teste agora exige pelo menos 15% de redução em todos os cinco casos e passou no Chrome local.

Este resultado comprova redução de ruído na amostra sintética com movimento conhecido. Não comprova reconstrução de texturas perdidas na compressão, melhora de gameplay real ou fluidez no Dell. Temporal permanece desligado por padrão e a aceitação no aparelho segue pendente. O tempo GPU de 2,14 ms registrado acima foi medido na v3 com temporal desligado, não nesta nova busca temporal.

## Continuação: versão 6.7.12-imagefilter.5 — imagens reais

Fonte: trailer oficial do Xbox, https://www.youtube.com/watch?v=3VYGOkMnGCE . Foi baixado um trecho solicitado de 35–45 segundos, em VP9/4K, sem cookies nem login. A extração por keyframes pode conter preroll; a referência local foi recodificada para 1080p e a cena foi selecionada por inspeção visual (Senua numa ponte em cenário escuro). Os arquivos ficam em output/videos, ignorado pelo git.

Referência local H.264 CRF12. Versão degradada H.264 CRF32 com teto 5 Mbps e taxa efetiva de 0,407 Mbps; não simula exatamente o xCloud. A comparação usa um segundo consecutivo a partir de 5 segundos do arquivo local; os cinco primeiros quadros são aquecimento e quadros totalmente pretos são excluídos. Foram medidos 23 quadros válidos. Métricas em luminância, amostragem a cada quatro pixels e máscara que exclui luminância menor que 5/255.

| Modo | MSE luminância | MSE das diferenças horizontais | GPU total p95 neste benchmark |
| --- | --- | --- | --- |
| CAS em 2 | 3,917636 | 2,367711 | Não coletado pelo budget |
| Espacial | 3,690342 | 2,135022 | 2,18 ms |
| Espacial + temporal 30% | 3,688004 | 2,134206 | 7,56 ms |

O espacial reduziu o erro de luminância aproximadamente 5,8% e o erro nas diferenças horizontais aproximadamente 9,8% frente ao CAS. O temporal acrescentou somente aproximadamente 0,06% de redução de erro de luminância frente ao espacial neste trecho. Os números não são um índice geral de qualidade percebida. O benchmark utiliza vários contextos e leituras de pixels para análise; seu tempo GPU não equivale ao comportamento de uma sessão normal de jogo.

Os resultados do primeiro intervalo, que continha um logotipo, foram descartados. Uma execução com referências vazias também foi descartada. O harness agora aguarda a atualização de apresentação após seek, exclui quadros pretos e exige quantidade mínima de quadros visíveis.

A v5 alterna buffers de histórico e de imagem reduzida em vez de copiar os dois a cada quadro. Não há evidência suficiente para atribuir ganho de desempenho a essa otimização; a correção deve ser confirmada nas regressões. Temporal continua desligado por padrão devido ao custo e ao pequeno ganho adicional observado nessa cena. Reconstrução de detalhes perdidos e desempenho sustentado no Dell seguem sem comprovação.

## Versão 6.7.12-imagefilter.6 — menu e troca de sessão

O usuário relatou melhora visual inicial com a v5, ainda sem avaliação prolongada. Solicitou controles no menu nativo, remoção das correções experimentais de cores e nitidez ajustável. Relatou que mudar de jogo impedia o diagnóstico até recarregar a aba.

Causa encontrada no gerenciador upstream: `destroy()` remove o canvas sem reiniciar `playerType`; uma sessão seguinte com o mesmo tipo não recria o renderizador. O build agora reinicia esse estado. A inicialização do adaptador também verifica `isStopped` depois do await, evitando reativar um motor encerrado. O erro inicial de importação relatado não foi reproduzido; essa proteção não prova sua causa.

Os controles extras são inseridos no grupo Vídeo, após Nitidez, usando as classes de linhas do Better xCloud. Uma instância dos controles é reutilizada quando o menu é reconstruído. Nitidez, processamento CAS/USM e modo Qualidade/Performance vêm das preferências nativas em cada renderização, inclusive quando o quadro não mudou. A referência CAS2 continua fixa. O limitador de halos normaliza os limites de vizinhança no modo Qualidade para preservar luminância uniforme.

Validação local: nove testes Node passaram, incluindo três sessões consecutivas com o gerenciador extraído do userscript gerado. O harness Chrome passou 32 verificações WebGL/DOM, incluindo nitidez alterando pixels, preservação de luminância no modo Qualidade, controles montados no contêiner do menu, valores mantidos após reconstrução do menu, diagnóstico num novo player e encerramento durante setup assíncrono. A sessão autenticada de xCloud e a aparência do menu no Dell ainda precisam da confirmação do usuário.

## Versão 6.7.12-imagefilter.7 — saída forçada, AA e orçamento GPU

Seleção de saída nativa, 1440p ou 2160p, com proporção da fonte preservada. Para fonte 16:9 resulta em 2560×1440 ou 3840×2160. Não depende do tamanho CSS da tela nem do DPR. A saída nativa acompanha a resolução efetivamente decodificada; selecionar 4K não altera o stream enviado pelo serviço nem o sinal HDMI do Windows. O player local compartilha a mesma seleção e o mesmo motor.

Antialiasing direcional próprio, opcional e desligado por padrão: detecta bordas inclinadas com alto contraste e mistura amostras ao longo da direção da borda. Executa após temporal, antes de EASU e nitidez. Não usa dados geométricos do jogo; não equivale a MSAA/TAA nem promete reduzir todo o shimmering. O teste comprova mistura na borda sintética inclinada e preservação de preto/branco uniforme e borda alinhada aos eixos.

Política GPU: limiares de 3, 6, 10 ms ou manual (0), mantendo a medição p95. Manual impede reduções automáticas por tempo GPU e cadência; não desativa a rejeição temporal de correspondências ruins. As etapas de pixels já rodam na GPU em todas as políticas.

Doze testes Node e 40 verificações WebGL/DOM passaram. O Chrome renderizou targets 3840×2160 e 2560×1440 independentemente da janela menor, retornou à saída nativa e não apresentou erros GL. Isso comprova tamanho interno e execução; não comprova fluidez 4K no Dell nem resolução física recebida pela TV. A avaliação visual de AA em Hellblade permanece pendente.
