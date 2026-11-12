# OpenFilm — contrato temporal para assets VFX (guia para agentes)

> **Leia antes de criar ou corrigir** animações HTML/Canvas/Three.js com entrada, hold e saída. A referência de comportamento é o player atual, não o tempo de demonstração do asset. Aplicável a Gentle Breeze, Frost Shatter, Rain Type, portais e efeitos similares.

## Regra central

**A duração efetiva do clipe na timeline determina o tempo total da animação.** O inspetor do VFX oferece apenas as durações de **entrada** e **saída**, além de propriedades artísticas como cor, texto e intensidade. **Não oferecer controles duplicados de `Total duration` ou `Hold duration`.**

Para um clipe não recortado que inicia no segundo zero de sua página:

- `total = timelineClipLength`.
- `inSeconds = entrada`, `outSeconds = saída`.
- `holdSeconds = Math.max(0, total - inSeconds - outSeconds)`.
- Entrada: `0 ≤ t < inSeconds`.
- Hold: `inSeconds ≤ t < total - outSeconds`.
- Saída: `total - outSeconds ≤ t < total`.
- O último estado deve estar completamente encerrado em `t = total`, respeitada a exclusividade do ponto final na timeline.

**Exemplo:** clipe de 20 s, entrada 2 s e saída 3 s → entrada 0–2, hold 2–17, saída 17–20. Redimensionar para 30 s preserva as durações de entrada e saída e aumenta somente o hold para 25 s.

Quando `entrada + saída > total`, documente uma política consistente. Recomendação: preservar a saída até onde couber e reduzir a entrada, sem hold negativo. Evite dividir por zero, deslocamentos negativos ou animação de saída fora do clipe.

## Contrato real do OpenFilm

| Camada | O que controla | Implicação para os agentes |
| --- | --- | --- |
| `saved.json.clip.time: [0,10.5]` | Duração **inicial** do clipe inserido | Não é o limite máximo; a timeline pode estender o clipe |
| `saved.json.durationMs` / catálogo `durationMs` | Metadados/duração inicial de biblioteca | Nunca usar como duração efetiva de renderização |
| `film.html` → `clip.time` | Início/fim da fonte efetiva | É a fonte de verdade do player |
| `--clip-length` em `:root` do iframe | Momento de término do clipe **no relógio da fonte** | Ler em cada frame como referência de fim da saída |
| `window.film.frame(t)` | Pedido determinístico de quadro no tempo `t` da fonte | Calcular a imagem apenas a partir de `t` e parâmetros |
| `window.film.duration` do asset | Duração **nativa** de uma página | **Não declarar** em assets cujo tempo é controlado pela timeline; ver falha crítica abaixo |

### Falha crítica reproduzida no Gentle Breeze

O player captura `window.film.duration` no carregamento do iframe como `c.native`. Em `packages/openfilm/src/film-doc.mjs`, `sourceAt()` limita páginas com duração nativa finita ao máximo `native - 0.001`.

Uma página que declara `window.film.duration = 10.5` e cujo clipe é alongado para 20 s continua recebendo **t ≈ 10.499 s** para todos os quadros posteriores. Se a saída deve começar em 17 s, ela **nunca acontece**.

**Correção para efeitos procedurais controlados pela timeline:** forneça `window.film.frame(t)`, mas **não forneça `window.film.duration` nem um getter de `duration`**. O clipe deverá ter `time: [start,end]` explícito no `saved.json`; sem a duração nativa, `clipSpan()` aceita o intervalo da timeline e `sourceAt()` não congela o relógio.

Não altere globalmente `sourceAt()` para quebrar a semântica de páginas que intencionalmente possuem duração nativa. Essa solução é **específica do contrato dos VFX proceduralmente esticáveis**.

### Como o tempo chega ao iframe

O servidor `packages/openfilm/studio/server/ops.mjs` contém `fitClipLengths()`. Ele sincroniza `--clip-length` no override do `:root` **apenas quando** `data-props` oferece explicitamente uma propriedade de tipo `var` com `var: '--clip-length'`. O inspetor `PropertiesSection.tsx` oculta esta propriedade técnica.

- Coloque `--clip-length: 10.5s` no CSS como **fallback** inicial, nunca como limite máximo fixo.
- Acrescente `{ "name": "Clip length (managed by timeline)", "type": "var", "var": "--clip-length" }` em `data-props`.
- Não ofereça o `--clip-length` como campo de tempo total que o usuário deve sincronizar manualmente.
- Leia `getComputedStyle(document.documentElement).getPropertyValue('--clip-length')` a cada `frame(t)`, usando o valor numérico em segundos.
- Declare `frameReadsOverrides: true`, pois `timeline.mjs` por padrão chama `frame(t)` antes de aplicar overrides. Esse sinal faz o player aplicar valores de CSS e texto **antes** do desenho.

## Esqueleto de implementação (para clipes que começam na fonte em t=0)

```html
<style>
:root {
  --clip-length: 10.5s; /* fallback; Studio atualiza ao redimensionar */
  --vfx-in: 2;
  --vfx-out: 3;
}
</style>
<script>
const num = (name, fallback) => {
  const raw = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue(name));
  return Number.isFinite(raw) ? raw : fallback;
};

function timing() {
  const total = Math.max(0.5, num('--clip-length', 10.5));
  const requestedIn = Math.max(0, num('--vfx-in', 2));
  const requestedOut = Math.max(0, num('--vfx-out', 3));
  const exit = Math.min(requestedOut, total);
  const entrance = Math.min(requestedIn, total - exit);
  const hold = Math.max(0, total - entrance - exit);
  return { total, entrance, hold, exit, exitStart: total - exit };
}

function frame(t) {
  const { total, entrance, exit, exitStart } = timing();
  const time = Math.max(0, Math.min(total, Number(t) || 0));
  let stage, progress;
  if (time < entrance) {
    stage = 'entrance';
    progress = entrance > 0 ? time / entrance : 1;
  } else if (time < exitStart) {
    stage = 'hold';
    progress = 1;
  } else {
    stage = 'exit';
    progress = exit > 0 ? (time - exitStart) / exit : 1;
  }
  renderAbsoluteFrame({ stage, progress, time, total }); // implementação do efeito
}

// IMPORTANTE: não declarar duration — congela o tempo após o fim nativo
window.film = { frame, frameReadsOverrides: true };
</script>
```

`renderAbsoluteFrame` é uma função ilustrativa a implementar para cada efeito; o código acima não pretende ser um asset executável sozinho. Use `progress` somente para a fase pertinente, sem reescalar a duração total. Os tempos de entrada e saída controlam a **velocidade temporal** de suas fases: menos segundos acelera, mais segundos desacelera. Qualquer `Speed` adicional deve controlar apenas a aparência das partículas, não impedir a conclusão da formação ou a dissolução.

## Arquivos de biblioteca

O bundle deve declarar pelo menos:

```json
{
  "version": 2,
  "kind": "clip",
  "clip": {
    "src": "my-effect.html",
    "time": [0, 10.5],
    "attrs": {
      "data-props": "[{\"name\":\"Entrance time\",\"type\":\"var\",\"var\":\"--vfx-in\"},{\"name\":\"Exit time\",\"type\":\"var\",\"var\":\"--vfx-out\"},{\"name\":\"Clip length (managed by timeline)\",\"type\":\"var\",\"var\":\"--clip-length\"}]"
    }
  },
  "durationMs": 10500
}
```

O `data-props` acima é uma string JSON contendo um array JSON. O `--clip-length` é registrado ali **somente para o mecanismo de sincronização da plataforma**; o inspector o oculta. O texto e outros parâmetros artísticos podem ser acrescentados normalmente.

### Recortes e divisão de clipe

A timeline usa um relógio da **fonte**, não necessariamente relativo a zero. Para `time: [start,end]` com `start > 0`, `--clip-length` indica o **fim no relógio da fonte** (`end`), não o comprimento `end - start`. O player entrega `frame(t)` em tempo de fonte. Assim, uma saída ancorada em `end - exit` permanece correta, mas uma nova entrada após um recorte inicial exige conhecer explicitamente o instante inicial. Não assuma que dividir ou recortar reinicia automaticamente a entrada. Teste split e trim separadamente antes de prometer esse comportamento.

## Distribuição e atualização de assets

`packages/openfilm/studio/server/saved.mjs` copia os HTMLs de `files/` da biblioteca para dentro de `saved/openfilm/` **uma vez**, mantendo arquivos existentes do projeto. Atualizar o arquivo na `main` não atualiza automaticamente clipes já importados.

- Para lançar uma correção com segurança, considere um **novo nome de arquivo interno versionado**, atualize `saved.json.clip.src` e a entrada do catálogo e preserve os clipes antigos.
- Reinserir o mesmo nome de HTML em um projeto que já o possui pode continuar executando uma versão obsoleta.
- Não sobrescrever cópias antigas de projetos sem migração explícita e preservação das personalizações.
- Atualize instruções para o usuário dizendo qual arquivo/versão deve ser carregado.

## Checklist de verificação obrigatório

1. **Duração inicial:** 10.5 s, entrada 2 s, saída 3 s → saída inicia em 7.5 s.
2. **Alongamento:** redimensionar na timeline para 20 s, mantendo 2 s / 3 s → hold de 15 s e saída entre 17–20 s. Confirmar que o player realmente entrega `frame(19)` e **não** `frame(10.499)`.
3. **Encurtamento:** reduzir para 8 s → saída entre 5–8 s.
4. **Velocidade de entrada/saída:** diminuir entrada e saída preserva o total e **aumenta** o hold; aumentar entrada e saída diminui o hold.
5. **Frames absolutos:** solicitar `frame(19), frame(2), frame(19)` deve gerar pixels idênticos nas duas renderizações de 19.
6. **Corte/trim/split:** validar sem pressupor relógio local zero; testar também um clipe com `start > 0`.
7. **Entrada/Saída com sobreposição:** não gerar progressos negativos/NaN ou saída além do fim.
8. **Pré-visualização e exportação:** testar ambas pela **timeline real**, não apenas pelo HTML aberto no Chromium.
9. **Projetos existentes:** confirmar qual versão interna do HTML está efetivamente carregada.
10. **Regressão dos outros tipos de página:** não alterar regras globais de `sourceAt()` sem testes extensivos.

Arquivos de referência: `packages/openfilm/src/film-doc.mjs` (`clipSpan`, `sourceAt`), `packages/openfilm/src/timeline.mjs` (`drawPage`, `frameReadsOverrides`), `packages/openfilm/studio/server/ops.mjs` (`fitClipLengths`), `packages/openfilm/studio/server/saved.mjs` (`takeSaved`, `copyIn`), `packages/openfilm/library/text/gentle-breeze/`.
