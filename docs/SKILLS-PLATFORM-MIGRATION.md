# Importar skills do repositório para a plataforma

O Agente Videomaker possui bibliotecas distintas de skills:

- `.agents/skills/`: instalação do Codex e outros agentes vinculada ao repositório atual.
- `<biblioteca>/Skills/`: skills pessoais da plataforma, disponíveis em todos os projetos do Studio.
- `packages/openfilm/manual/`: skills internas do motor, mantidas por compatibilidade.

No Linux, o destino padrão é `~/Videos/OpenFilm/Skills`; o caminho pode ser substituído por `OPENFILM_SKILLS` ou, dependendo da inicialização, por `OPENFILM_LIBRARY` (usado para calcular a pasta irmã `Skills`). O aplicativo já disponibiliza importação de pastas pelo botão **Skills**.

## Importação em lote das skills de Scenario

Na raiz do repositório, com as dependências instaladas:

```bash
node scripts/import-agent-skills.mjs
node scripts/import-agent-skills.mjs --apply
node packages/openfilm/bin/openfilm.mjs skills
```

O primeiro comando mostra as skills encontradas, o destino real e o que já existe. O segundo copia as skills ausentes para a biblioteca da plataforma; não altera nem remove os arquivos do projeto e não substitui skills existentes com o mesmo nome. O terceiro lista as skills que o motor pode oferecer.

A importação inclui arquivos auxiliares, como scripts e referências, e não instala automaticamente ferramentas externas (por exemplo, Scenario MCP) nem concede acesso a serviços pagos.

### Skill Music Video Director

A skill independente não está incluída nas dez pastas do Scenario. Instale-a separadamente pelo botão **Skills → Add from link**, informando:

```text
https://github.com/luigicollesi/music-video-director
```

Como alternativa, use a CLI nativa da plataforma:

```bash
node packages/openfilm/bin/openfilm.mjs skill add https://github.com/luigicollesi/music-video-director
```

As skills da plataforma são apresentadas aos agentes nas sessões de edição, exceto quando desabilitadas nas preferências. Inicie uma nova sessão de Codex depois da importação.

## Não excluir as fontes imediatamente

Confirme no aplicativo que as skills aparecem em **Skills → Yours** e que o Codex consegue acessá-las em um projeto diferente. Somente depois considere remover as cópias versionadas de `.agents/skills/` em uma alteração separada.

**Não confunda com Settings → Agents → Codex → Your skills:** essa área controla as skills próprias do Codex, enquanto a biblioteca da plataforma funciona para todos os projetos.
