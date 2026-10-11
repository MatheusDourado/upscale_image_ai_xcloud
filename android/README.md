# xCloud ImageFilter para Android — v9.2

App Android próprio (WebView) que abre o xCloud e injeta o userscript desta versão (Better xCloud 6.7.12 + tratamento de imagem **v9.2**). **Não é o app oficial do Better xCloud**: o app oficial é de código fechado (o repositório `redphx/better-xcloud-android` só tem o README), então não dá para modificá-lo.

## Instalar

1. Baixe `android/dist/xcloud-imagefilter-9.2.apk` deste repositório (no GitHub: abra o arquivo → **Download raw file**).
2. No celular, permita instalar apps da fonte usada (navegador ou gerenciador de arquivos) e instale.
3. Abra **xCloud ImageFilter**, faça login na conta Microsoft e entre num jogo.
4. No menu do Better xCloud → **Vídeo**, mantenha o renderizador **WebGL2**. O painel **Tratamento de imagem • v9.2** fica logo abaixo de Nitidez.

Pode ser instalado junto com o app oficial: o pacote é outro (`com.imagefilter.xcloud`) e o login é separado.

## O que o app faz

- Abre `https://www.xbox.com/play` em tela cheia, paisagem, tela sempre ligada, sem barras do sistema.
- Injeta o userscript **antes dos scripts da página** (document-start), com as mesmas regras `@match`/`@exclude` do Tampermonkey, só no frame principal. Usa a API de document-start do Android System WebView (a mesma do `androidx.webkit`). Em WebView antigo sem esse recurso, avisa e injeta no início do carregamento.
- User-agent do Chrome Android (sem a marca de WebView, que o xCloud recusa).
- **Stream em 1080p**: o xCloud escolhe a resolução pelo sistema informado e manda 720p para Android. Na primeira execução, o app ajusta a **Resolução alvo** do Better xCloud para **1080p (HQ)**, que se apresenta ao servidor como TV. Se você mudar essa opção, a sua escolha é mantida. Vale a partir da próxima sessão de jogo.
- **Marcado como jogo** (Android Game Mode / HyperOS Game Turbo): adicione o app ao Game Turbo para manter CPU e GPU em desempenho. O downscaling e a troca de FPS pelo sistema ficam desligados.
- O painel mostra se a decodificação é por hardware (MediaCodec) e o DT por quadro. No Android, ~5–15 ms é normal mesmo com hardware.
- Botão B do controle não fecha o jogo (Android converte B não tratado em "voltar").
- Depuração remota habilitada: com o celular no PC por USB, abra `chrome://inspect` para ver o console.

Limitações: **Iniciar/Encerrar e exportar medição** não baixa o JSON no app (WebView não trata downloads de blob). O microfone não é solicitado. Não há atualização automática.

## Sugestão inicial no Poco F7

Use os padrões da v9: saída **Automática** (renderiza na altura real da tela, ~1220–1280 px, com FSR, e aplica a nitidez no tamanho final), Nitidez USM 3, orçamento 6 ms. Para aparência mais natural, prefira Nitidez 2–3: valores altos aumentam a cintilação de textura. Para testar a **Reconstrução neural** (experimental), ligue-a e use Nitidez ~2,5. Compare **Novo tratamento** com **Referência: só nitidez**. Se aparecer o aviso de injeção tardia, atualize o **Android System WebView** pela Play Store.

## Build

Sem Gradle nem Android SDK (Ubuntu 24.04):

```sh
sudo apt-get install aapt dalvik-exchange zipalign apksigner openjdk-21-jdk-headless
android/build.sh
```

O script gera o userscript (`tools/build.py`), baixa o `android.jar` da API 34 se faltar, compila, gera o dex e assina com `android/debug.keystore`. Essa chave é **de teste** (senha `android`) e é fixa para que novas versões instalem por cima; não é segredo nem serve para loja.

Validado aqui: APK assinado (esquema v3), `minSdk 28`, `targetSdk 34`. O script injetado passa em `node --check`, carrega o motor v8.6 numa página `/pt-BR/play` com user-agent Android e não é injetado fora das regras. **Não foi testado num aparelho ou emulador**; a sessão com o xCloud real e o desempenho no Poco F7 estão pendentes.
