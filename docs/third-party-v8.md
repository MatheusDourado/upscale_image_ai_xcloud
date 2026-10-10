# Código de terceiros na v8

- Better xCloud: `script.js`, versão 6.7.12, MIT. O original não foi alterado. Fonte: https://github.com/redphx/better-xcloud .
- FSR1: `src/vendor/ffx_fsr1.h`, copyright AMD 2021, MIT, já incorporado na v7.1. SHA-256 do arquivo usado: `93c3922362ea7fc99cbcc698ca30c98de4f8c246d1fbb0b09e015ddef38ce3a5`. Fonte: https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h . O hash local identifica a fonte exata desta adaptação, sem assumir que o HEAD remoto permaneça igual.
- `src/shaders/rcas.glsl`: adaptação das equações de `FsrRcasF` dessa cópia, com denoise habilitado, reciprocais exatos protegidos e limiter local próprio. Slider 0–10 mapeia linearmente a força 0–1; não usa a escala em stops da função de configuração AMD. Amostragem normalizada permite a integração com os tamanhos de saída existentes. Copyright e licença MIT preservados no shader e no bundle.
- libplacebo: referência conceitual da pesquisa, nenhum código incorporado. Sem novos pacotes ou serviços de runtime.

O build inclui `BxBuild.sourceSha256`, calculado sobre os caminhos e bytes de `script.js`, `tools/build.py` e arquivos em `src/`. Esse identificador acompanha a exportação de diagnóstico. O SHA-256 do asset publicado é calculado separadamente nas notas da release.
