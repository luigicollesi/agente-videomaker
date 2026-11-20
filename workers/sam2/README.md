# SAM 2.1 Tiny — worker local experimental

Primeira etapa da implementação de Rotoscope para o Agente VideoMaker. **Isolado**: não altera a timeline, o MCP ou a renderização existentes. Nesta etapa processa **imagens** e devolve máscara em escala de cinza + PNG transparente opcional. Vídeos, interface Studio e MCP serão integrados depois de validar este contrato.

## Preparar (Linux, ambiente independente)

Requisitos: Python >=3.10; versões compatíveis de PyTorch >=2.5.1 e torchvision >=0.20.1, conforme [SAM 2 oficial](https://github.com/facebookresearch/sam2). A GTX 1050 Ti (compute capability 6.1) pode não funcionar com wheels CUDA modernas: use `--device cpu` para um primeiro teste, sabendo que será lento. Não altere o ambiente Python global do VideoMaker.

```bash
python3 -m venv .venv-sam2
source .venv-sam2/bin/activate
python -m pip install --upgrade pip
# Instale torch + torchvision compatíveis com seu hardware conforme pytorch.org.
git clone https://github.com/facebookresearch/sam2.git /tmp/videomaker-sam2
SAM2_BUILD_CUDA=0 python -m pip install -e /tmp/videomaker-sam2
python -m pip install pillow numpy
mkdir -p .dev/sam2
# Baixe o checkpoint oficial para .dev/sam2/sam2.1_hiera_tiny.pt:
# https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt
```

## Primeiro teste

```bash
python workers/sam2/segment.py \
  --input /caminho/foto.jpg \
  --checkpoint .dev/sam2/sam2.1_hiera_tiny.pt \
  --box '[50,50,350,350]' \
  --device cpu \
  --output-mask .dev/sam2/mask.png \
  --output-rgba .dev/sam2/foreground.png
```

Opcionalmente, substitua `--box` por `--points '[[100,100],[200,200]]' --labels '[1,0]'`, usando coordenadas no espaço de pixels da **imagem original**.

Sucesso: JSON em stdout com `ok: true`, caminho dos arquivos e score. Falha: JSON em stderr e exit code diferente de zero. O arquivo fonte nunca é alterado. Resultados em `.dev/` não são versionados.

## Contrato futuro

O Studio e MCP deverão invocar um adaptador Node assíncrono que valide paths e argumentos, controle jobs/cancelamento e reutilize estes outputs; **não** devem importar PyTorch no Electron. O trabalho futuro inclui vídeo por propagação SAM 2, preview, cache, assets derivados, exportação com alpha e testes de regressão. Não expor um comando como ferramenta MCP antes da integração real.
