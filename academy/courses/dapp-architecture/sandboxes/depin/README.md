# Sandbox: depin

DePIN-практика без оплаты: Akash CLI для офлайн-валидации SDL-деплоя
(децентрализованный аналог Cloud Run, урок 3.2) и два libp2p-узла для
демонстрации p2p pubsub из урока 3.8. Никаких токенов AKT и тестнетов.

## Запуск

```bash
docker compose up -d
```

## Smoke

```bash
# Akash CLI доступен и валидирует SDL офлайн
docker compose exec akash akash version
docker compose exec akash akash validate /work/deploy.yaml && echo "SDL OK"

# libp2p: соединить peer-a и peer-b, проверить p2p-связность
ADDR=$(docker compose exec -T peer-b ipfs id -f='<addrs>' | head -1)
docker compose exec -T peer-a ipfs swarm connect "$ADDR"
docker compose exec -T peer-a ipfs swarm peers      # → виден peer-b

# p2p pubsub: подписка на peer-b, публикация с peer-a
docker compose exec -T peer-b sh -c \
  'timeout 5 ipfs pubsub sub feed &' ; sleep 1
echo "new work published" | docker compose exec -T peer-a ipfs pubsub pub feed
```

## Что попробовать

- **Урок 3.2** — поменять `deploy.yaml`: ресурсы, цену ставки (`amount`),
  повторно `akash validate`. Понять reverse-auction и escrow-модель
  без реального деплоя.
- **Урок 3.8** — построить мини социальный граф на pubsub: события
  «опубликована работа» расходятся между пирами без сервера; обсудить,
  где здесь нужен CRDT, а где достаточно at-least-once.

> Реальный деплой в Akash требует кошелька с AKT и подключения к сети —
> здесь мы отрабатываем модель и SDL, а не биллинг.

## Reset

```bash
docker compose down -v
```
