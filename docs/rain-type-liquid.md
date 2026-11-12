# Rain Type — contrato temporal da timeline

Preset: `text/rain-type-liquid` (Text → In). Motor atualizado: `rain-type-liquid-timeline-v2.html`.

## Controles temporais

- **Entrance time** (`--rain-entry-duration`): duração da formação por gotas.
- **Exit time** (`--rain-exit-duration`): duração da evaporação e dispersão.
- **`--clip-length`**: propriedade técnica registrada em `data-props`, oculta pelo inspetor e sincronizada pelo OpenFilm com o **fim efetivo do clipe em tempo de fonte**.
- **Hold**: calculado internamente por `max(0, total - entrance - exit)`; sem controle independente.

A política de sobreposição prioriza a saída: `exit=min(requestedExit,total)`, `entrance=min(requestedEntrance,total-exit)`. Os valores configurados no inspetor não são alterados pelo redimensionamento da timeline.

O motor fornece `window.film = {frame, frameReadsOverrides:true}`, sem `duration` nativa. O player não deve limitar o relógio aos 10,6s de `saved.json`, que servem apenas como comprimento inicial. Os tempos são lidos novamente via `getComputedStyle(:root)` a cada frame absoluto.

## Teste executado (Chromium WebGL2 isolado)

Com entrada de 2 s e saída de 3 s:

| Timeline | Entrada | Hold | Saída |
| --- | --- | --- | --- |
| 8 s | 0–2 | 2–5 | 5–8 |
| 10,5 s | 0–2 | 2–7,5 | 7,5–10,5 |
| 20 s | 0–2 | 2–17 | 17–20 |

- Quadro t=19s renderizado após o ponto inicial de 10,6s.
- `frame(19), frame(2), frame(19)`: PNG idênticos.
- Alfa sem conteúdo visível nos finais t=8, t=10,5 e t=20.
- Entrada solicitada 25s + saída 3s em clip 20s: entrada efetiva 17s, hold 0, saída 3s.
- Sem erros JavaScript observados.

**Ainda pendentes**: execução pelo player real verificando t=19 em vez de 10.599, edição/resize/split/trim em Desktop, conferência de exportação versus prévia, e testes de 4K. Os testes headless acima não substituem integração end-to-end.

## Recortes e arquivos antigos

Para `clip.time=[start,end]` com `start>0`, o relógio de `frame(t)` é absoluto à **fonte** e `--clip-length=end`. A saída ancora no fim e funciona; a entrada não é reiniciada em um recorte/split à direita, pois o asset não recebe `start`. Não anunciar que os dois lados repetem entrada sem um contrato novo.

O arquivo interno **v2** tem nome diferente do antigo `rain-type-liquid.html`. Os arquivos já copiados para `saved/openfilm/` permanecem inalterados. Para obter a correção em projetos existentes, reinserir o preset da biblioteca e confirmar que o clipe aponta para `rain-type-liquid-timeline-v2.html`.

Fonte de verdade: `docs/vfx-timeline-timing-contract.md` e `.agents/skills/openfilm-vfx-timeline/SKILL.md`.
