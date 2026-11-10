# Histórico de mudanças

## 0.5.0

Alinha o contrato à especificação publicada na Base Técnica, que passou a ser a referência dos
nomes, e incorpora as respostas da Hypercube de 4 e 6 de novembro de 2026 às notas 5, 6 e 7.

Nomes alinhados ao decreto, como na Base Técnica:

- O recurso de títulos unitários passa de `/certificates` para `/units`, e `certificate_id` vira
  `unit_id`. Em vendas e baixas, `sold_certificates` e `consumed_certificates` viram `sold_units`
  e `consumed_units`.
- Venda: `transaction_id` e `transacted_at` viram `order_id` e `ordered_at`. Em
  `reversal_status`, `REVERSED` e `CANCELLED` viram `REFUNDED` e `VOIDED`.
- Baixa: `beneficiary_buyer_id` e `beneficiary_wallet` viram `retired_by_buyer_id` e
  `retired_by_wallet`. `beneficiary_name` continua, porque quem recebe o benefício pode ser outro.
- Medição: o status `CERTIFIED` vira `ISSUED`, e `notarization_hash` deixa de ser sempre
  obrigatório: passa a ser exigido quando o status for `NOTARIZED` ou `ISSUED`.

Medição (nota 5): o volume que o operador envia já é o adicional, e cada medição cobre só o
período desde a anterior, sem acumular. O cenário base é definido na certificação da instalação,
não em cada medição. Por isso `baseline_volume_m3` e `additional_volume_m3` saem, e `volume_m3`
passa a ser o volume adicional do período.

Baixa (nota 7): entra `purpose`, obrigatório, com as três finalidades do art. 22 da Lei nº
19.693/2026 (`VOLUNTARY_TARGET`, `ENVIRONMENTAL_REQUIREMENT` e `SUSTAINABILITY_PERFORMANCE`). A
Hypercube confirmou que vai implementá-las e previu a entrega para o fim de novembro.
`declared_purpose` continua como texto livre, complementar.

Baixa (resposta de 06/11): na Hypercube a baixa não queima o token, devolve-o à carteira principal
numa transação em grupo que cita as medições. `burn_tx_hashes` vira `retirement_tx_ids`, que vale
para os dois casos.

O certificado por m³ que a Hypercube emite na baixa (nota 6) ainda não entra: falta decidir se a
CearaPar vai recebê-lo. Ver "Pontos que o contrato não decide" no README.

## 0.4.0

O contrato deixa de ser dividido em etapas de implantação. Tudo segue em discussão para a
versão 1.0, e o rascunho passa a valer como um contrato só, com todos os recursos e campos.
Os campos e as regras antes marcados como etapa 2 (`x-stage`) agora são obrigatórios como os
demais, e `certificates` entra junto com os outros recursos. `notarization_hash` vira campo
obrigatório comum. O validador perde a opção `--stage`, e a página gerada por `bun run docs` perde
a coluna Etapa.

O contrato passa a ser um único `openapi.yaml`, escrito como o Scalar e o OpenAPI esperam: os
schemas, antes em `schemas/`, ficam em `components/schemas`, e os exemplos, antes em `examples/`,
ficam na resposta 200 de cada rota. O validador lê os dois de lá. A leitura e a conferência do
documento passam à CLI do Scalar (`bun run docs` e `bun run check`), no lugar do gerador próprio.
`bun run docs` serve a referência em português e inglês, com o Scalar carregado do pacote
instalado; o inglês é um OpenAPI Overlay em `i18n/`. `bun run mock` sobe o operador simulado do Scalar a partir do mesmo arquivo, com os erros 401 e
400 reescritos no formato da seção 1.4.

## 0.3.0

Autenticação pelo cabeçalho `Token: {token}`, no lugar de `Authorization: Bearer`, conforme a
resposta da CearaPar à nota 1 da Hypercube (28 de outubro de 2026). O validador deixa de aceitar
`--auth-scheme` e manda só o cabeçalho `Token`.

As decisões sobre as notas 2 a 8 não mudam os schemas: `ibge_municipality`, `end_use`,
`public_infrastructure` e `purpose` já estavam fora da versão 0.2; o cenário base, os certificados
e a finalidade da baixa aguardam a resposta da Hypercube.

Novo comando `bun run docs`, que gera `dist/contrato.html` para leitura do contrato.

## 0.2.0

Primeira versão do contrato em forma de código. Reproduz a versão 0.2 do contrato de dados
(2 de outubro de 2026): sete recursos, paginação, erros e as regras entre campos.
Inclui o validador (`validate` e `probe`).
