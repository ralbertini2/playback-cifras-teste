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
