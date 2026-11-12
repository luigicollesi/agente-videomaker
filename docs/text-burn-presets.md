# Text Burn — entrada, permanência e saída no mesmo clipe

Os presets ficam em **Text → Fire & ash**:

| Preset | Padrão |
| --- | --- |
| **Burn in — Forge** | Entrada com fogo por 3 s; depois o texto permanece |
| **Burn letters** | Entrada por letra por 3 s; depois o texto permanece |
| **Burn out — Ash** | Texto visível antes de desaparecer em 3 s |
| **Burn In + Hold + Burn Out** | Entrada por letra (2 s), texto estável (4 s), saída em cinzas (2 s) |

O quarto preset reúne as três fases **sem duplicar clipes**. Todos usam a mesma lógica procedural em HTML/Canvas 2D, `window.film.frame(t)`, fundo transparente e uma máscara tipográfica editável.

## Uso no Desktop

1. Na biblioteca, abra **Text → Fire & ash**.
2. Arraste **Burn In + Hold + Burn Out** para a timeline.
3. Edite **Text** no inspetor.
4. Configure **Burn In (s)**, **Burn Out (s)** e **Clip length (s)**. A fase de permanência é a diferença entre o comprimento do clipe e as duas durações.
5. Ajuste **Intensity**, **Embers**, **Final color**, **Letter stagger** e **Seed**.

Exemplo: para um clipe de **10 s**, escolha Burn In **2 s**, Burn Out **2 s** e Clip length **10 s**. O texto fica estável de **2 s a 8 s**.

**Sincronização necessária:** `Clip length (s)` é um parâmetro do efeito e deve corresponder à duração real do clipe na timeline. Ao redimensionar o clipe, atualize também esse parâmetro. Não há sincronização automática implementada neste ajuste.

A saída começa em `clipLength - outDuration`. Quando a soma das durações ultrapassa o clipe, o motor limita a saída ao tempo restante, evitando intervalos negativos. **Burn In** e **Burn Out** podem ser desativados individualmente definindo sua duração como zero.

O parâmetro antigo **Legacy duration** continua disponível para clips existentes; os presets anteriores mantêm duração inicial de 3 segundos, e o novo preset possui 8 segundos.

## Implementação

```text
packages/openfilm/library/text/
├── text-burn-forge/
├── text-burn-letters/
├── text-burn-ash/
└── text-burn-combined/
```

Cada bundle contém `files/text-burn-*.html`, `saved.json` e `poster.svg`, com registro em `library/index.json`. A animação é calculada a partir do tempo absoluto:

- **in** — renderizador de combustão, com duração própria
- **hold** — máscara do texto preenchida pela cor final; nenhum efeito de fogo é recalculado
- **out** — renderer Ash de desintegração; em `t >= clipLength`, a imagem fica transparente

A implementação mantém o protocolo `window.film.frame(t)` e usa funções puras para escolher a fase, garantindo avaliação fora de ordem.

## Testes e limites

Os testes estruturais em `text-burn-presets.test.mjs` verificam os presets, variáveis, duração e limites entre fases, incluindo seeks fora de ordem e clipes mais curtos que o conjunto de animações.

O motor permanece em **Canvas 2D**; não há fumaça volumétrica nem WebGL2. Os cards usam posters SVG e ainda não incluem `preview.mp4`. A verificação de desempenho em 4K e a inspeção visual no aplicativo Desktop precisam ser realizadas antes de afirmar que essas condições foram validadas.

O laboratório original segue em `examples/text-burn-lab/index.html`.
