# Text Burn — três presets procedurais

Os primeiros efeitos de texto com queima procedural estão em **Text → Fire & ash** na biblioteca do Agente Videomaker.

| Preset | Comportamento |
| --- | --- |
| **Burn in — Forge** | As letras surgem incandescentes por uma máscara de combustão |
| **Burn letters** | Cada letra queima com um atraso configurável |
| **Burn out — Ash** | As letras desaparecem em brasas e cinzas |

Todos os presets usam **HTML + Canvas 2D** e a API de tempo absoluto `window.film.frame(t)`, com fundo transparente. O motor foi adaptado do laboratório original mantido em `examples/text-burn-lab/index.html`.

## Utilização

1. Abra a biblioteca de assets do Studio e a categoria **Text**.
2. Escolha a seção **Fire & ash** e arraste um preset para a timeline.
3. Selecione o clip e altere o campo **Text** — pode ser uma frase, palavra ou letra única.
4. Ajuste **Intensity**, **Embers**, **Duration**, **Letter stagger** e **Seed** no inspetor.

O texto é guardado no elemento `.t`; o motor refaz as máscaras quando esse conteúdo muda. Os parâmetros são variáveis CSS do clip e não requerem imagens externas.

**Observações:** o modo Burn Letters utiliza atraso por grafema Unicode; textos de até 70 caracteres são suportados no protótipo. Para alterar a duração, atualize o intervalo do clip e o parâmetro **Duration** de modo coerente.

## Limites desta primeira integração

- A renderização permanece em Canvas 2D, não em WebGL2. Não afirmar fotorrealismo ou fumaça volumétrica.
- Os cards usam **posters SVG**. Vídeos `preview.mp4` ainda não foram versionados; a prévia animada precisa ser validada na interface do Studio.
- O desempenho em 4K e o comportamento de toda a timeline no Electron ainda precisam ser medidos. Os testes existentes verificam estrutura; os testes locais do laboratório verificaram renderização sem erro, alteração de texto e repetibilidade temporal.
- A identidade visual é original, sem assets externos nem licenças adicionais.

## Arquivos

Cada preset segue a estrutura nativa:

```text
packages/openfilm/library/text/text-burn-{forge,letters,ash}/
├── files/text-burn-*.html
├── saved.json
└── poster.svg
```

O laboratório interativo mantém os controles de demonstração e pode ser aberto separadamente no navegador por `examples/text-burn-lab/index.html`.
