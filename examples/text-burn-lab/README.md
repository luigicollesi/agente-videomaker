# Text Burn Lab — protótipos de VFX procedural

Três variantes do mesmo motor de texto editável:

- **Forge (`forge`)**: a palavra surge em áreas queimadas, com bordas incandescentes.
- **Letters (`letters`)**: as letras são incendiadas em sequência, com atraso configurável.
- **Ash (`ash`)**: letras se carbonizam e desaparecem em fragmentos.

## Executar

Abra `text-burn.html` em um navegador atualizado. Edite o texto, escolha a variante e ajuste intensidade, partículas, duração, atraso e seed. Use o slider inferior para inspecionar qualquer instante.

Para um teste em seu motor HTML sem interface, use `text-burn.html?embed=1&mode=forge&text=INFERNO` (ou `mode=letters` / `mode=ash`), enquanto os controles estiverem ocultos. O arquivo oferece `window.film.frame(t)` e `window.textBurn.setParams({...})`.

A integração final ao catálogo nativo requer um **bundle dedicado** e `saved.json`, `poster.jpg`, `preview.mp4` e a entrada em `library/index.json`. Este pacote é um laboratório, **não** está integrado ao repositório do Agente Videomaker.

## Reprodutibilidade

A renderização é uma função de `tempo, texto, modo, seed, parâmetros e tamanho do canvas`. Teste verificado com Playwright/Chromium: mesmo `frame(1.4)` antes e depois de `frame(2.2)` gerou pixels idênticos (data URL igual); sem exceções JS.

## Limites atuais

- O efeito é **Canvas 2D procedural**, não simulação volumétrica real de fogo ou de fluidos; é um protótipo visual forte, não photorealistic final.
- A máscara de caracteres usa rasterização e campos fractais; em 4K, o custo por frame exige otimização com **WebGL2 / fragment shader**, downsampling e caches.
- A tipografia depende das fontes locais presentes no navegador; para render reprodutível em outros computadores inclua uma fonte licenciada no bundle.
- Transparência e blending precisam de validação no host de timeline, especialmente para o modo `screen`.
- Sem dependências externas, chamadas pagas ou assets sujeitos a licenças.

## Arquivos

- `text-burn.html` — demo interativa, texto e variantes editáveis.
- `forge.gif`, `letters.gif`, `ash.gif` — amostras animadas de 12 instantes cada (interpoladas a 10 fps para apresentação).
- `forge.png`, `letters.png`, `ash.png` — screenshots inspecionados.
- `test_render.py`, `render_gifs.py` — utilitários locais de verificação e renderização que usam Playwright e FFmpeg; opcionais.