<p align="center">
  <img src="docs/logo-light.svg#gh-light-mode-only" alt="Agente Videomaker" height="112">
  <img src="docs/logo-dark.svg#gh-dark-mode-only" alt="Agente Videomaker" height="112">
</p>

<h3 align="center">Plataforma de edição e criação audiovisual com agentes de IA.</h3>

<p align="center"><strong>Interface preta e vermelha • Studio editável • Codex e outros agentes</strong></p>

> **Projeto independente baseado em [OpenFilm](https://github.com/openfilm/openfilm)** (licença MIT).
> O motor de edição, o formato `film.html` e o comando `openfilm` são mantidos por compatibilidade.
> Este fork não é uma distribuição oficial do OpenFilm nem é endossado por seus mantenedores.

## Executar no Ubuntu

Requisitos de desenvolvimento: Node.js 22.18+, pnpm 9, FFmpeg e Git.

```bash
git clone https://github.com/luigicollesi/agente-videomaker.git
cd agente-videomaker
pnpm install --frozen-lockfile
pnpm dev:desktop
```

O editor oferece uma timeline visual e um chat conectado a agentes externos como Codex. A aparência e a identidade são personalizadas para o Agente Videomaker; a arquitetura e as integrações de edição permanecem compatíveis com o upstream.

## Desenvolvimento e validação

```bash
pnpm typecheck
pnpm test
```

- [Código do fork](https://github.com/luigicollesi/agente-videomaker)
- [Relatar um problema](https://github.com/luigicollesi/agente-videomaker/issues)
- [Skill Music Video Director](https://github.com/luigicollesi/music-video-director)
- [Projeto OpenFilm original](https://github.com/openfilm/openfilm)

## Créditos e licenças

O Agente Videomaker usa código OpenFilm licenciado sob MIT. Os avisos originais de licença, atribuição e terceiros permanecem neste repositório. A marca OpenFilm pertence a seus respectivos titulares. A nova identidade visual do Agente Videomaker não representa o projeto original.

