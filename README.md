<p align="center">
  <img src="docs/logo-light.svg#gh-light-mode-only" alt="Agente Videomaker" height="112">
  <img src="docs/logo-dark.svg#gh-dark-mode-only" alt="Agente Videomaker" height="112">
</p>

<h3 align="center">Plataforma de edição e criação audiovisual com agentes de IA.</h3>

<p align="center"><strong>Interface preta e vermelha • Studio editável • Codex e outros agentes</strong></p>

> **Base tecnológica:** o Agente Videomaker utiliza como ponto de partida o código-fonte do projeto de código aberto [OpenFilm](https://github.com/openfilm/openfilm), obtido em **11 de novembro de 2026 (11/11/2026)**, sob a **licença MIT**.
> A partir dessa base, o Agente Videomaker desenvolve sua própria identidade visual, recursos e integrações. O motor de edição, o formato `film.html` e o comando `openfilm` são preservados por compatibilidade.
> Este é um projeto independente: não constitui uma distribuição oficial do OpenFilm nem é endossado por seus mantenedores.

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

O Agente Videomaker é desenvolvido sobre uma base de código do **[OpenFilm](https://github.com/openfilm/openfilm)**, retirada do projeto original em **11/11/2026**. Os créditos pelo código original pertencem aos **colaboradores do OpenFilm**. A licença **MIT** autoriza seu uso, modificação e distribuição, desde que sejam mantidos os respectivos avisos de licença e direitos autorais.

As modificações, funcionalidades adicionais e a identidade visual do Agente Videomaker são desenvolvimentos deste projeto independente. Os avisos originais de licença, atribuição e terceiros permanecem no repositório, incluindo o arquivo [LICENSE](LICENSE). A marca OpenFilm pertence a seus respectivos titulares; não há afiliação oficial ou endosso dos mantenedores do OpenFilm.

