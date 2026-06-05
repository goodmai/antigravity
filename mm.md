# Исследование сборки MetaMask Extension для тестирования (Synpress, Playwright, Selenium)

В данном файле описана ветка, версия, требования и пошаговый порядок сборки расширения MetaMask для интеграции с тестовыми фреймворками.

---

## 1. Ветка и Версия (Branch & Version)

* **Основная ветка:** `main` (или `develop`).
  В официальном репозитории MetaMask нет отдельной долгоживущей ветки для тестирования dApps. Сборка для тестирования настраивается с помощью сборочных флагов и скриптов в `package.json` прямо из ветки `main`.
* **Текущая версия кодовой базы:** `13.36.0` (находится в `package.json`).
* **Совместимость с Synpress:**
  * **Synpress Classic (v3)** (на базе Cypress) по умолчанию использовал версии MetaMask `10.x` (например, `10.22.3`, `10.30.0` или `10.34.0`).
  * **Synpress v4 (New Dawn)** (на базе Playwright) поддерживает более новые версии MetaMask (`11.x`, `12.x` и `13.x`). Synpress v4 использует механизм кэширования профиля браузера (Wallet Cache), создавая снимок состояния кошелька один раз и переиспользуя его в тестах.
  * Для локальной разработки и тестирования рекомендуется отключать систему защиты **LavaMoat**, так как она изолирует глобальные объекты и мешает тестовым фреймворкам контролировать интерфейс расширения.

---

## 2. Порядок сборки (Build Instructions)

### Системные требования:
* **Node.js**: Версия `>=24.13.0` (проверено на `v24.15.0`).
* **Yarn**: Версия `4.x` (управляется через Node Corepack). **Важно:** не устанавливайте Yarn глобально.

### Пошаговый процесс:

1. **Включение Corepack:**
   Убедитесь, что Corepack включен для правильной работы Yarn Berry (v4):
   ```bash
   corepack enable
   ```

2. **Настройка конфигурационного файла `.metamaskrc`:**
   Сборочный скрипт MetaMask требует наличия конфигурационного файла в корне. Скопируйте шаблон:
   ```bash
   cp .metamaskrc.dist .metamaskrc
   ```
   Откройте `.metamaskrc` и убедитесь, что переменная `INFURA_PROJECT_ID` содержит значение. Для тестовой сборки достаточно указать заглушку:
   ```env
   INFURA_PROJECT_ID=00000000000000000000000000000000
   ```

3. **Установка зависимостей:**
   Запустите Yarn из корня проекта MetaMask:
   ```bash
   yarn install
   ```
   *Примечание:* Это также склонирует необходимые AI-ассистентам «скиллы» в кэш `.skills-cache` (можно пропустить, если сборка запускается в чистом CI, так как это не влияет на саму сборку расширения).

4. **Сборка расширения:**
   В зависимости от ваших задач выберите один из вариантов сборки:

   * **Вариант А: Сборка для тестирования без LavaMoat (Рекомендуемый для E2E)**
     ```bash
     yarn build:test:dev
     ```
     Эта команда запускает сборку с флагом `--apply-lavamoat=false`. Скомпилированные распакованные файлы расширения будут находиться в директории `./dist/`. Именно эту папку следует передавать в Playwright / Cypress / Selenium.

   * **Вариант Б: Живая сборка с автообновлением кода (Live Build)**
     ```bash
     yarn start:test
     ```
     Следит за изменениями кода и пересобирает расширение «на лету». LavaMoat и Snow в этом режиме отключены по умолчанию.

   * **Вариант В: Production-like тест-сборка с LavaMoat**
     ```bash
     yarn build:test:webpack
     ```
     Используется для проверки работоспособности расширения в максимально приближенных к релизу условиях (с включенной защитой LavaMoat).

   * **Вариант Г: Быстрая загрузка предсобранных тест-билдов (без компиляции)**
     Если вам не нужно менять исходный код расширения, вы можете скачать готовые тестовые сборки Chrome и Firefox прямо с серверов MetaMask:
     ```bash
     yarn download-builds --build-type test
     ```
     Готовые сборки распакуются в директорию `./dist/`.

---

## 3. Использование с Playwright и Selenium

### Загрузка расширения в Playwright
После компиляции расширения (например, через `yarn build:test:dev`) укажите путь к распакованной сборке (обычно это папка `./dist/chrome` или `./dist/`):

```typescript
import { chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

const pathToExtension = path.join(__dirname, 'scratch/metamask-extension/dist/chrome');

const context = await chromium.launchPersistentContext('', {
  headless: false, // Браузерные расширения требуют графический режим
  args: [
    `--disable-extensions-except=${pathToExtension}`,
    `--load-extension=${pathToExtension}`,
  ],
});
```

### Загрузка расширения в Selenium (Python-пример)
```python
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

chrome_options = Options()
chrome_options.add_argument("--load-extension=scratch/metamask-extension/dist/chrome")

driver = webdriver.Chrome(options=chrome_options)
driver.get("chrome-extension://{METAMASK_ID}/home.html")
```
