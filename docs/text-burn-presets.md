# Text Burn — animações de entrada, hold e saída controladas pela timeline

Os quatro presets ficam em **Text → Fire & ash**:

| Preset | Entrada padrão | Saída padrão | Duração inicial do clipe |
| --- | --- | --- | --- |
| **Burn in — Forge** | 3 s (combustão) | 0 s | 3 s |
| **Burn letters** | 3 s (por letra) | 0 s | 3 s |
| **Burn out — Ash** | 0 s | 3 s (cinzas) | 3 s |
| **Burn In + Hold + Burn Out** | 2 s | 2 s | 8 s |

Os efeitos compartilham um renderizador determinístico em HTML/Canvas 2D com fundo transparente e texto editável. A duração inicial da biblioteca **não é um limite máximo**.

## Contrato temporal obrigatório

**O comprimento efetivo do clipe na timeline é a única fonte do tempo total.** No inspetor, use apenas:

- **Entrance time** (`--burn-in-duration`): duração da aparição;
- **Exit time** (`--burn-out-duration`): duração do desaparecimento.

O hold é calculado automaticamente:

`hold = max(0, timelineDuration - entranceTime - exitTime)`

Exemplo: para um clipe de **20 s**, com entrada de **2 s** e saída de **3 s**, as fases são **entrada 0–2 s**, **hold 2–17 s**, **saída 17–20 s**. Alterar o comprimento do clipe não altera as durações configuradas de entrada e saída. Se a soma ultrapassar o total, a saída tem prioridade e a entrada é reduzida ao intervalo disponível.

Para um preset de somente entrada, `Exit time = 0` significa que o texto permanece até o fim do clipe. Para um preset de somente saída, `Entrance time = 0` significa que ele começa já visível. É possível habilitar entrada e saída em qualquer preset, mantendo o modo visual padrão de cada um.

## Integração ao OpenFilm

- O motor lê a propriedade CSS `--clip-length` (por exemplo, `20s`), sincronizada pelo `fitClipLengths()` da plataforma, a cada frame.
- O `saved.json` declara essa propriedade em `data-props`. Ela **não aparece** no inspetor, pois é gerenciada pela timeline.
- `window.film = { frame, frameReadsOverrides: true }` garante que overrides de texto e parâmetros sejam aplicados antes da renderização.
- **Não declarar `window.film.duration`**: o player registra o valor como duração nativa e congela `sourceAt()` no último frame da duração inicial, mesmo que o clipe seja estendido.
- A animação calcula cada quadro em tempo absoluto; não depende do último frame renderizado.
- Controles legados `Legacy duration` e `Clip length (s)` foram **removidos do inspetor**. A variável `--burn-duration` permanece no CSS como compatibilidade para os defaults internos de presets antigos, mas não controla a timeline.

Consulte também `docs/vfx-timeline-timing-contract.md` e `.agents/skills/openfilm-vfx-timeline/SKILL.md`.

## Versões e migração de projetos

Os motores de biblioteca atualizados usam novos nomes internos:

| Preset | Novo arquivo |
| --- | --- |
| Forge | `text-burn-forge-timeline.html` |
| Letters | `text-burn-letters-timeline.html` |
| Ash | `text-burn-ash-timeline.html` |
| Combined | `text-burn-combined-timeline.html` |

Isso evita o problema de **cópias antigas de arquivos HTML preservadas dentro do projeto**: ao inserir novamente um preset após atualizar o OpenFilm, o novo motor será copiado com o novo nome. Os clipes antigos continuam associados a seus arquivos antigos, sem alteração automática.

Para migrar, insira novamente o preset e copie texto, cores e parâmetros úteis do clipe anterior. Confira se o clipe novo realmente está referenciando o nome `*-timeline.html`.

## Testes

`packages/openfilm/studio/server/text-burn-presets.test.mjs` valida a estrutura dos quatro bundles, vínculo com o catálogo, controles visíveis e propriedade técnica de duração, a ausência de `window.film.duration` e o cálculo temporal em clipes de 3, 8 e 20 segundos. Inclui regressão para `sourceAt()` sem duração nativa.

O renderizador continua em Canvas 2D. Os posters são SVG; nenhum preview MP4 foi criado. A verificação integral da interface Desktop, exportação e desempenho 4K exige execução no ambiente do projeto.

O laboratório original segue em `examples/text-burn-lab/index.html`.
