# Contrato de dados do SCH-CE

Especificação da API que cada operador credenciado expõe para a CearaPar consultar, no
Sistema de Créditos Hídricos do Ceará. Este repositório guarda o contrato em forma
legível por máquina e um validador que o operador roda contra a própria API.

Versão atual: **0.5.0**, rascunho da versão 1.0. Parte da versão 0.2 do contrato, de 2 de outubro
de 2026, com a autenticação pelo cabeçalho `Token`, decidida em 28 de outubro de 2026 na resposta às
notas da Hypercube, e as respostas dela de 4 e 6 de novembro. Todos os campos e recursos seguem em
discussão até a 1.0. O histórico está no `CHANGELOG.md`.

## O que tem aqui

| Caminho | O que é |
|---|---|
| `openapi.yaml` | O contrato inteiro, em OpenAPI 3.1: rotas, parâmetros, respostas, autenticação, os schemas em `components/schemas` e um exemplo fictício por recurso. **É a fonte única.** |
| `scalar.config.json` | Configuração da página do Scalar. |
| `i18n/en.overlay.yaml` | Os textos do contrato em inglês, num [OpenAPI Overlay](https://spec.openapis.org/overlay/v1.0.0.html) aplicado sobre o `openapi.yaml`. |
| `src/`, `test/` | O validador e seus testes. Os schemas e exemplos vêm do `openapi.yaml`. |

## Leitura e conferência do contrato

```bash
bun run docs    # referência da API em http://localhost:4173, em português e inglês
bun run check   # confere se o openapi.yaml é OpenAPI 3.1 válido
```

A página usa o [Scalar](https://github.com/scalar/scalar) (licença MIT), servido a partir do pacote
instalado: não depende de CDN nem do proxy do Scalar, e funciona sem internet. O seletor no alto do
menu troca o idioma do conteúdo e da interface. Depois de editar o `openapi.yaml` ou uma tradução,
recarregue a página. A configuração desliga a telemetria, as fontes externas, o assistente, a barra
de ferramentas e o botão "Test Request". Não use `scalar document share`: ele publica o contrato num
endereço público.

O `openapi.yaml` é escrito em português. Cada outro idioma é um overlay que troca só os textos
(`title`, `summary` e `description`). Os testes falham se um texto do `openapi.yaml` ficar sem
tradução, se a tradução apontar para algo que não existe mais ou se mudar qualquer coisa além de
texto. Os exemplos fictícios ficam como estão.

## Operador simulado

```bash
bun run mock    # responde como um operador em http://localhost:4174 (outra porta: PORT=...)
```

É o servidor simulado do Scalar, montado sobre o `openapi.yaml`: devolve o exemplo de cada rota,
exige o cabeçalho `Token` (qualquer valor serve) e confere os parâmetros. Serve para desenvolver o
lado da CearaPar sem depender da API de um operador.

O Scalar responde dois erros num formato próprio. O `src/mock.ts`
reescreve só esses dois: o 401 passa a trazer o objeto de erro do contrato, e o parâmetro inválido,
que o Scalar responde com 422, passa a receber 400. Com isso o mock passa no `probe` inteiro. A
versão do `@scalar/mock-server` fica fixa, porque a reescrita depende do formato dele; se uma
atualização mudar esse formato, o mock falha em vez de responder errado. Ao mudar o `openapi.yaml`,
reinicie o mock.

## Validador

Requer [Bun](https://bun.sh). Depois de `bun install`:

```bash
# Confere um arquivo (um registro, uma lista ou uma resposta completa)
bun src/cli.ts validate plants registros.json

# Consulta a API do operador e confere autenticação, erros, paginação e registros
export SCH_TOKEN=...   # credencial de homologação
bun src/cli.ts probe https://api.operador.exemplo --token-env SCH_TOKEN
```

`probe` aceita `--resource <nome>` (repetível), `--limit` e `--max-pages` (padrão 5). A credencial
vai no cabeçalho `Token`. Use sempre a credencial de **homologação**. O comando termina com
código 1 se houver erro, o que permite usá-lo em integração contínua.

Por recurso, `probe` verifica que:

- uma requisição sem credencial recebe HTTP 401 com objeto de erro;
- `updated_since` inválido recebe HTTP 400 com objeto de erro;
- a resposta tem `items`, `next_page_token` e `total_count`, e a paginação termina em `null`;
- cada registro respeita o schema;
- as regras entre campos se cumprem: os volumes das medições somam o volume total da operação,
  `gross_amount_brl` repete `gross_amount` quando a moeda é BRL, e o período da medição não termina antes de começar.
- erros retornam com o código HTTP de erro adequado (HTTP 200 com corpo de erro é rejeitado).

## Desenvolvimento

```bash
bun test          # testes
bun run typecheck # tipos
```

## Pontos que o contrato não decide

O texto da versão 0.2 deixa estes pontos em aberto. O validador adotou a leitura abaixo, que
precisa de confirmação:

- **Decimais** são números JSON, não strings.
- **Estorno** (`reversal_status` diferente de `NONE`): `reversed_at`, `reversal_effect` e
  `reversal_competence` passam a ser obrigatórios.
- **Timestamps** aceitam qualquer `date-time` terminado em `Z`.

Dois pontos vêm das respostas da Hypercube e dependem de decisão da CearaPar:

- **Certificado por m³.** A Hypercube emite um certificado único para cada m³ só no momento da
  baixa, com origem geográfica, processo, setor da fonte, data de produção e as transações que
  comprovam a medição (resposta de 04/11 à nota 6). O recurso `units` supõe um certificado
  emitido junto com a medição, como na Lei nº 19.693/2026 (arts. 17 e 18). Falta decidir se o
  contrato passa a receber o certificado da baixa e se essa ordem atende ao art. 23, § 1º do
  Decreto nº 37.488/2026, o que é pergunta para o jurídico.
- **Volume de cada medição na baixa.** A transação de baixa cita as medições de origem, mas não
  quantos m³ saíram de cada uma; essa divisão fica no sistema do operador (conferido na rede em
  06/11). `consumed_measurements` registra quais medições, não quanto de cada.

## Nota sobre publicação

O repositório não tem licença definida. Defina uma antes de torná-lo público.
O texto das cláusulas citadas no contrato deve passar pelo jurídico da CearaPar.
