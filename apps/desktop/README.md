# Agente Videomaker — aplicativo desktop

Aplicativo Electron baseado no Studio do OpenFilm, com chat lateral para Codex, Claude Code e outros agentes. Este fork personaliza **a apresentação visual**, preservando os identificadores internos, o formato de projetos e o mecanismo de edição.

## Desenvolvimento

Na raiz do monorepositório:

```bash
pnpm install --frozen-lockfile
pnpm dev:desktop
pnpm typecheck
pnpm test
```

O nome de exibição no Electron é **Agente Videomaker Dev**. Para manter a compatibilidade das configurações, as pastas internas de dados e as dependências ainda preservam os identificadores técnicos `openfilm`.

As builds e os instaladores existentes ainda usam parte dos recursos originais. Não confunda o nome exibido na interface com o nome de um binário ou pacote publicado.

## Créditos

Este é um fork independente de [OpenFilm](https://github.com/openfilm/openfilm). Consulte as licenças e avisos de terceiros existentes no repositório.
