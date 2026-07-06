# Отчет о тестировании MetaMask Extension с использованием Playwright & Synpress

В данном отчете представлены результаты автоматического тестирования собранного расширения MetaMask (`v13.36.0`) с использованием фреймворка Playwright и библиотеки `@synthetixio/synpress` (`v4.x` / `@synthetixio/synpress-metamask@0.0.14`).

---

## 1. Сводка результатов (Test Summary)

* **Запуск тестов:** Выполнен через `@playwright/test` в графическом режиме (headed) с загрузкой распакованного расширения из `./scratch/metamask-extension/dist/chrome`.
* **Общий статус:**
  * **Verify MetaMask API and handles availability** — **Успешно (Passed)**
  * **Perform Wallet Import / Onboarding** — **Провален (Failed - Timeout)**
  * **Verify Account operations** — **Провален (Failed - Timeout)** (так как зависел от успешного импорта)
  * **Verify Lock and Unlock operations** — **Провален (Failed - Timeout)** (так как зависел от успешного импорта)

---

## 2. Анализ доступности методов и ручек Synpress (API Inventory)

Фреймворк успешно импортировал класс `MetaMask` из пакета `@synthetixio/synpress/playwright` и проинспектировал его прототип. Все основные ручки управления (Page Objects) и методы доступны.

### Доступные страницы управления (Handles):
1. **`onboardingPage`** — Страница онбординга и импорта кошелька.
2. **`homePage`** — Главная страница кошелька (балансы, переключение аккаунтов, селекторы).
3. **`lockPage`** / **`crashPage`** — Страницы блокировки и обработки падений расширения.
4. **`settingsPage`** — Страница настроек (включение небезопасного подписывания, расширенные настройки).
5. **`notificationPage`** — Всплывающие уведомления dApp (подключение к сайту, подтверждение транзакций, подписи).

### Список всех доступных методов API:
Ниже представлен полный список методов класса `MetaMask`, готовых к использованию в тестах:

| Категория | Метод | Описание |
| :--- | :--- | :--- |
| **Импорт / Настройка** | `importWallet(seedPhrase)` | Импорт кошелька по сид-фразе |
| | `importWalletFromPrivateKey(privateKey)` | Импорт аккаунта по приватному ключу |
| **Управление аккаунтами**| `addNewAccount(accountName)` | Добавление нового аккаунта |
| | `renameAccount(current, new)` | Переименование аккаунта |
| | `switchAccount(accountName)` | Переключение на выбранный аккаунт |
| | `getAccountAddress()` | Получение публичного адреса текущего аккаунта |
| **Сети** | `addNetwork(networkOpts)` | Добавление кастомной RPC сети |
| | `switchNetwork(name, isTestnet)` | Переключение сети кошелька |
| **Интеграция с dApp** | `connectToDapp(accounts)` | Подтверждение подключения dApp к кошельку |
| | `addNewToken()` | Подтверждение добавления нового токена dApp-ом |
| **Блокировка** | `lock()` | Блокировка кошелька |
| | `unlock()` | Разблокировка кошелька паролем |
| **Подпись сообщений** | `confirmSignature()` | Подтверждение подписи сообщения (персональной/структурированной) |
| | `confirmSignatureWithRisk()` | Подтверждение подписи с предупреждением о риске |
| | `rejectSignature()` | Отклонение запроса на подпись |
| | `providePublicEncryptionKey()` | Предоставление публичного ключа шифрования |
| | `decrypt()` | Расшифровка сообщения по запросу dApp |
| **Транзакции** | `confirmTransaction(options)` | Подтверждение транзакции (с выбором газа) |
| | `rejectTransaction()` | Отклонение транзакции |
| | `confirmTransactionAndWaitForMining(opts)`| Подтверждение и ожидание майнинга транзакции в сети |
| | `approveTokenPermission(options)` | Одобрение лимита расходов токенов (Token Allowance) |
| | `rejectTokenPermission()` | Отклонение лимита расходов токенов |
| | `openTransactionDetails(txIndex)` | Открытие деталей транзакции в списке активности |
| | `closeTransactionDetails()` | Закрытие деталей транзакции |
| **Настройки** | `openSettings()` | Переход в меню настроек |
| | `openSidebarMenu(menu)` | Переход в конкретный пункт настроек |
| | `toggleShowTestNetworks()` | Включение/выключение тестовых сетей |
| | `toggleDismissSecretRecoveryPhraseReminder()`| Скрытие напоминания о резервной копии |
| | `resetAccount()` | Сброс истории аккаунта (Clear activity tab) |
| | `unsafe_enableEthSign()` | Включение опасного метода `eth_sign` |
| | `disableEthSign()` | Отключение метода `eth_sign` |

---

## 3. Анализ несовместимости с текущей версией MetaMask (`v13.36.0`)

В ходе выполнения шага **Wallet Import / Onboarding** произошел таймаут (2 минуты). 

### Причина сбоя:
При попытке кликнуть на чекбокс согласия с условиями использования ("I agree to MetaMask's Terms of Use") на странице онбординга, библиотека Playwright вернула ошибку перехвата клика:
```
<div class="relative flex size-6 items-center justify-center rounded border-2 ... border-primary-default">…</div> intercepts pointer events
```
Это означает, что дизайн страницы соглашения в MetaMask `v13.36.0` изменился по сравнению с версией, под которую писались селекторы Synpress Metamask `v0.0.14`. В результате элемент чекбокса перекрывается декоративным слоем (`div`), клик по которому не регистрируется стандартным селектором Synpress.

### Рекомендации по устранению:
1. **Обновление Synpress:** Поскольку Synpress v4 активно разрабатывается, требуется обновить `@synthetixio/synpress` до последней минорной версии, где селекторы адаптированы под MetaMask v13.
2. **Использование MetaMask Flask:** Рекомендуется использовать девелоперскую сборку [MetaMask Flask](https://metamask.io/flask/), которая более лояльна к тестовым средам, либо скачать стабильный предсобранный релиз MetaMask v10/v11 через `yarn download-builds --build-type test`, который гарантированно совместим со стабильной версией Synpress.
3. **Обход селекторов (Локальный патч):** При необходимости использовать именно MetaMask `v13.36.0` в тестах, можно временно переопределить селекторы онбординга в файлах `node_modules/@synthetixio/synpress-metamask`, добавив параметр `{ force: true }` для кликов по перекрываемым чекбоксам.
