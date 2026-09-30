# LiveChat Desktop

Shell Electron do LiveChat. O aplicativo não empacota uma cópia do frontend: ele carrega exclusivamente `https://livechat.kaiangazineu.dev`, portanto requer internet e recebe atualizações da interface pelo deploy web normal.

## Segurança

A janela usa `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true`. O shell também:

- restringe navegação à origem HTTPS exata do LiveChat;
- bloqueia pop-ups e `webview`;
- abre somente links externos `http:`/`https:` no navegador do sistema;
- permite câmera, microfone, compartilhamento e notificações somente ao renderer principal na origem autorizada;
- expõe no preload apenas operações específicas de sessão, chamada, notificação e atualização;
- não persiste o access token em disco (ele existe somente em memória no processo principal e no renderer enquanto é usado pelo frontend);
- criptografa o refresh token com `safeStorage` no diretório de dados do usuário;
- envia o refresh token somente para a origem fixa `https://livechat-api.kaiangazineu.dev`, sem seguir redirects;
- recusa persistência no Linux quando o backend do `safeStorage` é `basic_text`.

O frontend remoto nunca recebe `ipcRenderer`, `shell`, filesystem ou APIs Node genéricas.

## Desenvolvimento

Requisitos: Node 24 e npm 11.

```bash
npm ci
npm run dev
```

O modo de desenvolvimento também carrega a URL de produção. Isso preserva a mesma origem de REST, STOMP, Cloudinary e LiveKit e evita relaxar a política de navegação.

## Validação

```bash
npm test
npm run typecheck
npm run build
```

## Compartilhamento de tela e áudio

O shell habilita `session.setDisplayMediaRequestHandler` com o seletor nativo no macOS 15+ quando disponível. Como fallback, lista telas e janelas usando `desktopCapturer`, sem expor `desktopCapturer`, `ipcRenderer` ou uma API genérica ao frontend remoto. Quando o frontend solicita áudio, o fallback inclui `audio: 'loopback'` no Windows; o Electron 44 não oferece loopback de áudio do sistema por esse handler no Linux ou macOS. Nessas plataformas, o áudio depende das opções fornecidas pelo seletor nativo/portal.

O botão web “Parar compartilhamento” deve encerrar as tracks LiveKit de `ScreenShare` e `ScreenShareAudio`. Volume remoto, persistência do volume, reaplicação em novas tracks e prevenção de reprodução duplicada são responsabilidades do frontend/LiveKit, pois cada receptor controla esses elementos localmente.

O loopback pode incluir qualquer som reproduzido no computador, inclusive a própria chamada. Recomende headset para reduzir eco acústico e informe no frontend quando o stream retornado por `getDisplayMedia()` não contiver uma track de áudio. No macOS, o bundle declara a finalidade de captura de áudio; a autorização de captura de tela é gerenciada pelo macOS em **Privacidade e Segurança → Gravação de Tela e Áudio do Sistema**.

Validar manualmente antes de cada release:

- Windows 11;
- Ubuntu em Wayland com PipeWire/portal;
- Ubuntu em X11;
- câmera e microfone;
- troca de microfone e saída de áudio;
- headset Bluetooth;
- compartilhamento de tela e janela;
- reconexão de rede e retorno para a chamada.

## Sessão segura

A integração do frontend usa a ponte `window.liveChatDesktop` quando executada no Electron. Na web, o comportamento atual por cookies continua sendo usado como fallback.

No Linux é necessário um keyring compatível, como GNOME Keyring, KWallet ou KeePassXC Secret Service. O aplicativo não grava refresh token quando o Electron informa o backend inseguro `basic_text`.

## Build

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Artefatos:

- Windows x64: instalador NSIS `.exe`;
- Ubuntu/Linux x64: `.AppImage` sem `--no-sandbox`;
- macOS universal (Intel + Apple Silicon): `.dmg` para instalação e `.zip` para o updater.

Builds de macOS devem ser executados em macOS. A workflow `Desktop artifacts and release` pode ser iniciada manualmente em **Actions → Run workflow** e disponibiliza os três pacotes como artifacts por 14 dias, sem criar um GitHub Release. Nesse modo, o workflow desabilita explicitamente assinatura e notarização para não interpretar secrets ausentes como caminhos de certificados; os pacotes são apenas para testes e exibem os avisos normais do Windows SmartScreen/macOS Gatekeeper.

Releases por tag exigem assinatura Authenticode no Windows e Developer ID + notarização no macOS. Configure:

- `WINDOWS_CSC_LINK` e `WINDOWS_CSC_KEY_PASSWORD`;
- `MACOS_CSC_LINK` e `MACOS_CSC_KEY_PASSWORD`;
- `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID` e `APPLE_API_ISSUER`.

`APPLE_API_KEY_BASE64` deve conter a chave `.p8` codificada em Base64. Nenhum certificado ou segredo deve entrar no repositório.

## Releases e atualizações

O versionamento é semântico em `package.json`. Crie tags no formato:

```text
desktop-v1.0.0
```

A workflow valida que a tag corresponde à versão do `package.json`, gera instaladores assinados, verifica assinatura/notarização e publica somente os artefatos necessários, metadados do updater e `SHA256SUMS` no GitHub Releases. `electron-updater` verifica atualizações ao iniciar e a cada seis horas, baixa em segundo plano e avisa o frontend quando a atualização está pronta. A instalação só ocorre depois da ação explícita do usuário.

O updater desktop é necessário apenas quando o shell, permissões, integrações nativas ou Chromium mudarem. Alterações comuns de interface continuam sendo distribuídas pelo deploy web.
