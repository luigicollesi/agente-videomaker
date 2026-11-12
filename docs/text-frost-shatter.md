# Frost Shatter — congelamento e fragmentação de texto

Preset nativo: **Text → Ice & fracture → Frost Shatter**.

O efeito usa HTML + Canvas 2D, textura cristalina procedural, linhas de fissura, fragmentos rígidos com rotação e partículas de gelo. O canvas tem fundo transparente, sem dependências externas.

## Uso

Arraste **Frost Shatter** da biblioteca para a timeline e selecione o clip.

| Inspetor | Variável CSS | Padrão |
| --- | --- | --- |
| Text | elemento `.t` | CONGELADO |
| Duration | `--frost-duration` | 4 s |
| Freeze intensity | `--frost-intensity` | 1 |
| Fracture | `--frost-fracture` | 1 |
| Particles | `--frost-particles` | 1 |
| Seed | `--frost-seed` | 42 |

A duração do clip e `--frost-duration` devem corresponder. Os textos são segmentados em grafemas Unicode com `Intl.Segmenter`. Cada frame é função dos parâmetros, das dimensões e do tempo absoluto `window.film.frame(t)`, sem estado incremental de partículas.

## Sequência

- 0–56%: gelo surge progressivamente, com brilho e cristais externos
- 37–74%: fissuras se propagam
- 54–98%: fragmentos giram e se dispersam
- 87–100%: partículas e fragmentos desaparecem

## Limitações e validação

- Motor Canvas 2D; não há simulação física volumétrica, refração real ou motion blur.
- A prévia original foi renderizada no Chromium, mas o poster SVG é apenas representativo.
- A validação de 1080p/4K no Desktop, os testes de renderização e o CI devem ser registrados separadamente; não são presumidos por este documento.
- Não há assets externos nem licenças adicionais.

## Diretório

`packages/openfilm/library/text/text-frost-shatter/`: `saved.json`, `files/frost-shatter.html`, `poster.svg`.
