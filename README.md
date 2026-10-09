# Racha Conta — divida a conta do bar sem confusão (HTML + JS)

Calculadora para dividir a conta do bar ou do restaurante entre amigos: com os 10% do garçom, o couvert artístico, itens que só alguns consumiram e os centavos batendo certinho com o total. No fim, é só copiar o resumo e mandar no grupo do WhatsApp.

**Acesse online:** https://micdog22.github.io/racha-conta/

## Recursos
- **Modo rápido:** total da conta, número de pessoas, serviço (10% por padrão, dá para desligar ou mudar a porcentagem) e couvert por pessoa.
- **Modo detalhado:** lista de pessoas e de itens (nome, preço, quantidade) marcando quem dividiu cada item, como a cerveja só para quem bebeu.
- Serviço proporcional ao consumo de cada um; couvert só para quem foi marcado.
- Desconto opcional, em reais ou em porcentagem, dividido na proporção do consumo.
- Arredondar a parte de cada um para cima (próximo R$ 1 ou R$ 5), mostrando o que sobra como gorjeta extra.
- Tudo em centavos inteiros: a soma das partes sempre fecha exatamente com o total.
- **Copiar resumo** em formato pronto para o WhatsApp, com chave Pix opcional no final.
- A conta atual fica salva no navegador (localStorage) até você clicar em **Nova conta**.

## Como usar
1. Escolha **Rápido** (todo mundo paga igual) ou **Detalhado** (cada um paga o que consumiu).
2. Ajuste o serviço, o couvert e o arredondamento, se quiser.
3. Preencha o total e o número de pessoas, ou cadastre as pessoas e os itens.
4. Confira quanto cada um paga e toque em **Copiar resumo**.

Exemplo de resumo copiado:

```
*Happy hour da firma* — total R$ 179,00
• Ana: R$ 63,00
• Bruno: R$ 63,00
• Carla: R$ 53,00
_serviço de 10% incluído · couvert de R$ 15,00 por pessoa · desconto de R$ 10,00 · arredondado para cima (+R$ 2,15 de gorjeta)_
Pix: maria@example.com (Maria Exemplo)
```

Os valores aceitam o formato brasileiro: `1.234,56`, `1234,56`, `12,5` ou `12.50`.

## Como rodar localmente
Módulos ES não carregam via `file://`, então sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
```

e abra http://localhost:8000.

## Testes
```bash
npm test
```
(usa só o `node:test`, sem dependências; precisa do Node 18 ou mais novo)

## Como funciona
- Cada item é dividido igualmente entre quem o consumiu. As cotas exatas de cada pessoa são somadas **antes** de arredondar, então os centavos são distribuídos uma única vez, sem acumular sobras em ninguém.
- A distribuição usa o **método do maior resto**: cada pessoa recebe o piso da sua parte exata e os centavos que faltam vão para as maiores frações (em caso de empate, para quem vem antes na lista). O resultado é determinístico e soma exatamente o total.
- O desconto é abatido do consumo na proporção do que cada um consumiu; o serviço é calculado sobre o consumo já com desconto e repartido na mesma proporção. O couvert não entra na base do serviço.
- No modo rápido, consumo e serviço são divididos juntos, então as partes diferem em no máximo 1 centavo.

O serviço de 10% é opcional: a calculadora só ajuda a fazer a conta.

## Contribuindo
Issues e pull requests são bem-vindos.

## Licença
MIT — veja [LICENSE](LICENSE).
