# Playback Cifras v12.1 — ajustes da v12 normal

Base: Playback Cifras v12.

## Ajustes aplicados

- Uso do logo anexado pelo usuário (`logo-playback-cifras.jpg`) no topo esquerdo.
- Correção do scroll do menu lateral em telas pequenas.
- Rodapé compacto com apenas três botões: **Voltar**, **Tocar/Pausar** e **Próxima**.
- Botões inferiores mantidos dentro da tela, sem rolagem horizontal.
- Ícone de pausa corrigido para padrão flat via CSS, sem emoji.

## Funcionalidades preservadas

- Login Google.
- Leitura do Google Drive.
- Seletor de pasta.
- Abertura de PDFs.
- Execução de MP3.
- Favoritos, playlists, zoom, rolagem e navegação atual.

## Arquivos alterados

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

## Arquivos criados

- `logo-playback-cifras.jpg`

## Testes realizados

- Validação de sintaxe JavaScript com `node --check app.js`.
- Verificação da presença dos IDs essenciais usados pelo JavaScript.
- Conferência dos arquivos esperados no pacote final.

## Observações

Após subir no GitHub, recoloque em `config.js`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_API_KEY`


## Playback Cifras v12.2 — Ajustes

### Arquivos alterados
- `styles.css`
- `README.md`

### Ajustes aplicados
- O menu lateral no celular/iPad agora fica acima do rodapé, permitindo acessar a lista completa de músicas.
- O rodapé recebeu maior respiro inferior para não ficar colado ao limite da tela.
- O zoom interno do PDF foi corrigido para não esticar o documento: o canvas não é mais comprimido por `max-width` enquanto mantém altura fixa.

### Funcionalidades preservadas
- Login Google.
- Leitura do Google Drive.
- Abertura de PDFs.
- Reprodução dos MP3s.
- Navegação anterior/próxima.
- Favoritos, playlists, zoom, rolagem e cache existentes.

### Testes realizados
- Verificação de sintaxe JavaScript com `node --check app.js`.
- Inspeção dos seletores CSS alterados.
- Geração do pacote ZIP para envio ao GitHub.

### Possíveis riscos
- Em alguns navegadores mobile, a barra inferior do navegador pode reduzir a área útil. Ao instalar como PWA na tela inicial, a área disponível tende a melhorar.
- PDFs muito largos em zoom alto podem exigir rolagem horizontal no modo interno, preservando a proporção correta.
