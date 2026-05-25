---
## **name: greenfield description: Работа с BNB Greenfield в проекте Daskibo/Antigravity. Развертывание локального private-chain, интеграция с Devnet/Testnet, управление жизненным циклом bucket/object, расчет стоимости хранения (pricing) и связка с Lit Protocol/Chipotle DRM.**

# **Greenfield Integration Architecture**

Используй этот skill для проектирования, развертывания, аудита и отладки подсистемы хранения данных BNB Greenfield внутри монорепозитория Daskibo/Antigravity.

## **Быстрый Выбор Справочника**

* **Инфраструктура и оркестрация:** smartcontracts/greenfield-local/ и smartcontracts/greenfield-testnet/ (Docker Compose профили, конфигурация валидаторов и Storage Providers).  
* **Бизнес-логика публикации контента:** smartcontracts/buckets/course-publish.js и course-read.js (манифесты Lit/Chipotle DRM, формирование структуры курсов).  
* **Интеграционный слой SDK:** smartcontracts/greenfield-testnet/sdk-backend.mjs (клиенты Greenfield SDK, обработка криптографических подписей, генерация Off-Chain Auth Tokens).  
* **Диагностика сбоев:** Справочник известных багов (EIP-712, кейсы несовпадения регистров адресов и несоответствия типов Msg) находится в \[Bug Hunter Skill\].

## **Рабочий Подход**

1. **Идентификация окружения:** Перед выполнением операций определи strict-контекст: local-mock, standalone-local, devnet, testnet, или mainnet.  
2. **Изоляция слоев:** Четко разделяй логику консенсуса (Greenfield Blockchain Node) и логику хранения (Storage Provider API).  
3. **Криптографическая верификация:** Всегда проверяй соответствие chain\_id при генерации EIP-712 подписей для вызовов delegateUploadObject.  
4. **Безопасность метаданных:** Документы manifest.json курса должны содержать только зашифрованные CID/симметричные ключи, привязанные к Lit Protocol Access Control Conditions (ACC).

## **Развертывание локальной ноды Greenfield**

Локальный стек включает в себя саму ноду блокчейна Greenfield (Tendermint \+ Cosmos SDK) и один или несколько локальных сервисов Storage Provider (SP), эмулирующих децентрализованное хранилище.

### **Шаг 1: Подготовка (Инициализация конфигурации и переменных окружения)**

Перейди в рабочую директорию локального деплоя smartcontracts/greenfield-local/. Скопируй шаблон окружения .env.example в .env. Убедись, что порты 26656 (P2P), 26657 (RPC), 9090 (gRPC) и 8080 (SP Gateway) свободны на хост-машине.

### **Шаг 2: Оркестрация сети (Запуск локального блокчейна / Genesis Node)**

Запусти контейнер валидатора Greenfield. Это сформирует локальный генезис-блок с предустановленным chain\_id (например, greenfield\_9000-1) и распределит тестовые токены на дефолтные адреса разработчиков.

docker compose up \-d greenfield-node

Ожидай лога Executing block для подтверждения старта консенсуса.

### **Шаг 3: Слой хранения (Инициализация и запуск Storage Provider)**

После того как блокчейн начал генерировать блоки, запусти локальный SP. При старте он автоматически выполнит транзакцию регистрации (MsgRegisterSP) в локальной сети Greenfield.

docker compose up \-d greenfield-sp

SP поднимет HTTP-шлюз на порту 8080 для обработки загрузок объектов.

### **Шаг 4: Тестирование (Верификация работоспособности и фондирование)**

Проверь статус сети через RPC-запрос. Если высота блоков (latest\_block\_height) растет, сеть стабильна. Выполни импорт локального приватного ключа в клиент gnfd-cmd для проверки баланса.

curl \-s http://localhost:26657/status | jq '.result.sync\_info'

## **Матрица конфигураций: Local vs Devnet vs Testnet**

При переключении режимов в sdk-backend.mjs и конфигурационных файлах docker-compose, используй следующие параметры среды:

| Параметр Конфигурации | Local Private-Chain | Greenfield Devnet | Greenfield Testnet |
| :---- | :---- | :---- | :---- |
| **Chain ID** | greenfield\_9000-1 (custom) | greenfield\_5600-1 | greenfield\_5600-1 |
| **Tendermint RPC** | http://localhost:26657 | https://rpc.devnet.greenfield.wtf | https://gnfd-testnet-fullnode-tendermint.bnbchain.org:443 |
| **gRPC Endpoint** | localhost:9090 | grpc.devnet.greenfield.wtf:9090 | gnfd-testnet-fullnode-tendermint.bnbchain.org:9090 |
| **Primary SP URL** | http://localhost:8080 | https://sp.devnet.greenfield.wtf | https://gnfd-testnet-sp1.bnbchain.org |
| **Тип Нативного Токена** | BNB (Локальный минт) | tBNB (Devnet Faucet) | tBNB (Testnet Faucet) |
| **Cross-Chain Bridge** | Отсутствует | Отключен / Эмуляция | Подключен к BSC Testnet |

## **Критические ручки взаимодействия (API / SDK Handles)**

Взаимодействие с Greenfield внутри Antigravity разделено на два уровня: Chain Client (транзакции Cosmos SDK) и SP Client (работа с файлами по протоколу Amazon S3-like).

### **Ключевые вызовы Greenfield SDK**

Ниже приведены основные программные интерфейсы (handles), используемые в sdk-backend.mjs и course-publish.js:

import { Client } from '@bnb-chain/greenfield-js-sdk';

// Инициализация единого клиента взаимодействия  
const client \= Client.create(GRPC\_ENDPOINT, GREENFIELD\_CHAIN\_ID);

#### **1\. Создание бакета (client.bucket.createBucket)**

Используется при первичной публикации курса для изоляции контента.

* **Параметры:** bucketName, creator (address), visibility (Public/Private), paymentAddress.  
* **Что под капотом:** Формирует и подписывает транзакцию MsgCreateBucket. Требует оплаты газа в BNB.

#### **2\. Делегированная загрузка объекта (client.object.delegateUploadObject)**

Основной эндпоинт для бэкенда Antigravity. Позволяет пользователю загружать файлы курсов напрямую в SP, используя подпись бэкенда (без раскрытия приватного ключа пользователя).

* **Параметры:** bucketName, objectName, body (File/Buffer), duration (в секундах), delegatedOpts (EIP-712 signature).

#### **3\. Получение метаданных объекта (client.object.headObject)**

Используется для проверки существования файлов контента и чтения пользовательских метаданных (X-Gnfd-User-Metadata).

* **Параметры:** bucketName, objectName.

#### **4\. Генерация Off-Chain Auth Token (client.offchainauth.genOffChainAuthKeyPair)**

Необходим для бесшовного скачивания приватных объектов или манифестов курсов без постоянного вызова всплывающего окна MetaMask на фронтенде.

* **Результат:** Пара ключей времени выполнения, сохраняемая в localStorage браузера и верифицируемая на SP.

## **Модель стоимости хранения (Pricing)**

Расчет стоимости удержания объектов на Greenfield подчиняется строгому алгоритму. Суммарная стоимость хранения TotalCost для бакета вычисляется по следующей формуле:

TotalCost \= Sum\_of\_Primary\_SPs(Size\_i \* PrimarySpPrice) \+ Sum\_of\_Secondary\_SPs(Size\_j \* SecondarySpPrice)

Где:

* Size\_i — размер оригинального объекта в байтах.  
* PrimarySpPrice — базовая ставка первичного Storage Provider за байт в секунду.  
* SecondarySpPrice — ставка вторичных провайдеров (реплик) для обеспечения избыточности (обычно резервируется 4 копии контента).

**Важный архитектурный нюанс:** При обновлении или удалении объектов (MsgDeleteObject) зарезервированный, но неизрасходованный бюджет списания (Locked Balance) на аккаунте платежного потока (PaymentAccount) возвращается на основной баланс пользователя, за вычетом штрафа за досрочное удаление (если объект хранился меньше минимального лимита времени SP).

---
