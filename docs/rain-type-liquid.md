# Rain Type — água, hold e evaporação

Preset: `text/rain-type-liquid` (biblioteca **Text → In**).

## Controles do inspetor

| Propriedade | CSS | Padrão |
| --- | --- | --- |
| Text | `.t` | `INFERNO` |
| Entry duration (s) | `--rain-entry-duration` | `5.1` |
| Hold duration (s) | `--rain-hold-duration` | `0.6` |
| Exit duration (s) | `--rain-exit-duration` | `4.9` |
| Drops | `--rain-drops` | `1` |
| Glow | `--rain-glow` | `0.55` |
| Wind | `--rain-wind` | `0.18` |
| Vapor | `--rain-vapor` | `1` |
| Refraction | `--rain-refraction` | `0.75` |
| Seed | `--rain-seed` | `27` |

As três durações são independentes e o tempo total interno é sua soma. A entrada mantém o movimento de chuva original, o hold mantém a água animada e a saída converte a palavra em vapor de cima para baixo.

**Duração na timeline:** `saved.json` cria inicialmente um clip de 10,6 s. O inspetor altera o tempo *interno* do efeito, mas a mudança dessas variáveis CSS não redimensiona automaticamente o clip na timeline. Ao aumentar ou reduzir a soma das três durações, ajuste também o comprimento do clip na timeline para que as três fases sejam exibidas integralmente e não haja tempo ocioso após o término.

## Renderização

- HTML standalone com shaders WebGL2, Canvas 2D para máscara tipográfica e saída RGBA.
- `window.film.frame(t)` usa tempo absoluto; renderizar frames fora de ordem não depende de estado acumulado.
- A forma final é alimentada pelas gotas que chegam a destinos do texto.
- Não existem assets externos, fontes remotas ou bibliotecas de terceiros.
- WebGL2 é necessário; neste protótipo não há fallback Canvas 2D.
- Qualidade e desempenho em 4K dependem do hardware e ainda precisam de teste no Desktop.

## Validação inicial

Renderização local em Chromium com WebGL2: sem erros JavaScript observados; frame re-renderizado após frame fora de ordem foi idêntico; variação dos controles 2 + 3 + 2 resultou em 7 s; alfa inicial e final não apresentam conteúdo visível. O teste real de drag/drop, exportação e timeline do Desktop deve ser feito no aplicativo.
