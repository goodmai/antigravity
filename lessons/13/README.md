# Урок 13: Облачная разработка (Google Cloud & Firebase)

> Как агент Antigravity безопасно управляет облаком Google: keyless-доступ,
> Firestore Rules как код, инфраструктура для Cloud Run / GKE и локальная
> проверка через эмулятор.

Antigravity обеспечивает бесшовную интеграцию с облаком через
специализированные MCP-серверы (см. [Урок 10](../10/README.md)). Агент не
«ходит в облако напролом» — между ним и Google Cloud стоит слой MCP,
который выполняет команды от его имени, но в рамках выданных прав.

---

## 🗺️ Как агент видит облако (архитектура)

```
┌──────────────┐   tool call    ┌─────────────┐   gcloud / SDK   ┌───────────┐
│  Agent (LLM) │ ─────────────▶ │  MCP-сервер │ ───────────────▶ │  GCP API  │
│  планирует    │ ◀───────────── │ (Firebase / │ ◀─────────────── │ Firestore │
│  шаги         │   результат    │  gcloud)    │   ответ/логи     │ Cloud Run │
└──────────────┘                └─────────────┘                  └───────────┘
        ▲                              │
        │  артефакт (план/прогресс)    │ короткоживущий OIDC-токен
        └──────────────────────────────┘
```

Ключевые свойства этой архитектуры:

- **Агент не хранит секретов.** Аутентификацию делает MCP-слой через
  Workload Identity Federation, токен живёт минуты.
- **Каждое действие — это tool call.** Его видно в артефакте, можно
  отменить до выполнения (см. режимы агента, [Урок 1](../1/README.md)).
- **Облако — не «чёрный ящик».** Логи Cloud Logging возвращаются агенту,
  он сам диагностирует ошибку деплоя.

---

## 🔥 Firebase MCP

Агент имеет прямой контроль над Firebase-проектами через MCP-сервер.

**Возможности:**

- `firebase init` — инициализация проекта (hosting, Firestore, functions).
- **Firestore Rules** — агент пишет и проверяет правила безопасности,
  опираясь на модель «запрещено по умолчанию».
- **Deploy** — деплой функций и хостинга одной командой.
- **Logs** — анализ ошибок в реальном времени через Cloud Logging.

### Firestore Rules: запрещено по умолчанию

Правила безопасности — это **исполняемый код доступа**, а не настройка.
Базовый безопасный шаблон:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // По умолчанию — полный запрет
    match /{document=**} {
      allow read, write: if false;
    }

    // Пользователь читает/пишет только свой документ
    match /users/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }

    // Публичный контент: читать всем, писать — только владельцу
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.resource.data.authorId == request.auth.uid;
      allow update, delete: if request.auth != null
                            && resource.data.authorId == request.auth.uid;
    }
  }
}
```

> ⚠️ `resource.data` — это документ **до** записи, `request.resource.data` —
> то, что клиент **пытается** записать. Путаница между ними — частая
> причина дыр в правилах.

### Цикл разработки правил

```
пишешь правило ─▶ гоняешь кейсы доступа в ЭМУЛЯТОРЕ ─▶ деплоишь только зелёное
```

```bash
# Локальный прогон без облака
firebase emulators:start --only firestore
# Тесты правил (Jest + @firebase/rules-unit-testing)
npm test
# Деплой только после зелёных тестов
firebase deploy --only firestore:rules
```

---

## ☁️ Google Cloud Platform (GCP)

Агент управляет ресурсами GCP через Terraform или `gcloud` CLI, но делает
это безопасно.

- **No API Keys** — используется IAM и Identity Federation. Никаких
  JSON-ключей в коде и CI-секретах.
- **Инфраструктура как код** — агент генерирует конфигурации для Cloud Run
  и GKE, которые ревьюятся и версионируются.

### Keyless: Workload Identity Federation (WIF)

Главный архитектурный принцип облачной работы агента — **keyless**.
Вместо долгоживущих JSON-ключей сервис-аккаунтов:

```
CI / среда ──(OIDC-токен)──▶ GCP STS ──(token exchange)──▶ короткоживущий
   access-token (≈1 час) ──▶ GCP API ──▶ доступ только в рамках роли SA
```

Почему это безопаснее:

| | JSON-ключ | Workload Identity Federation |
|:---|:---:|:---:|
| Срок жизни | Бессрочный | Минуты / 1 час |
| Где хранится | Файл / CI-секрет | Нигде (выдаётся на лету) |
| Утечка из репозитория | Катастрофа | Невозможна (нечего утекать) |
| Ротация | Ручная | Автоматическая |

Настройка пула федерации (пример для GitHub Actions OIDC):

```bash
gcloud iam workload-identity-pools create "gh-pool" \
  --location="global" --display-name="GitHub Pool"

gcloud iam workload-identity-pools providers create-oidc "gh-provider" \
  --location="global" --workload-identity-pool="gh-pool" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"

# Привязка: только репозиторий goodmai/antigravity может выступать как SA
gcloud iam service-accounts add-iam-policy-binding \
  "deployer@PROJECT.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/NUM/locations/global/workloadIdentityPools/gh-pool/attribute.repository/goodmai/antigravity"
```

### Least privilege IAM

Сервис-аккаунту деплоя — минимальные роли, а не `roles/owner`:

```bash
# Плохо: SA может всё
gcloud projects add-iam-policy-binding PROJECT \
  --member="serviceAccount:deployer@PROJECT.iam.gserviceaccount.com" \
  --role="roles/owner"            # ❌ слишком широко

# Хорошо: ровно то, что нужно для деплоя в Cloud Run
gcloud projects add-iam-policy-binding PROJECT \
  --member="serviceAccount:deployer@PROJECT.iam.gserviceaccount.com" \
  --role="roles/run.admin"        # ✅
gcloud projects add-iam-policy-binding PROJECT \
  --member="serviceAccount:deployer@PROJECT.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"   # ✅ только для actAs
```

### Инфраструктура как код: Cloud Run

```hcl
resource "google_cloud_run_v2_service" "api" {
  name     = "antigravity-api"
  location = "europe-west1"

  template {
    containers {
      image = "europe-west1-docker.pkg.dev/PROJECT/repo/api:1.0.0"
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
    }
    scaling {
      min_instance_count = 0   # scale-to-zero: не платим в простое
      max_instance_count = 10
    }
    service_account = google_service_account.runtime.email
  }
}
```

Cloud Run vs GKE — когда что:

| Критерий | Cloud Run | GKE |
|:---|:---|:---|
| Модель | Контейнер как сервис | Полный Kubernetes |
| Масштаб до нуля | ✅ из коробки | ⚠️ нужен KEDA |
| Сложная сеть / сайдкары | ограниченно | ✅ |
| Операционная нагрузка | минимальная | высокая |
| Когда выбрать | HTTP-сервисы, API, джобы | stateful, mesh, кастомные операторы |

---

## 📝 Задание

Если у вас есть доступ к Firebase-проекту:

1. Попросите агента: _«Покажи список моих приложений в текущем Firebase
   проекте»_.
2. Если проекта нет: _«Объясни, как создать новый проект Firebase через
   консоль»_.
3. Дополнительно: _«Напиши Firestore Rules, где пользователь может читать
   и менять только свои документы в коллекции `notes`, и сгенерируй тесты
   правил для эмулятора»_. Прогоните тесты локально.

---

## 🔬 Как это работает глубже

Главный архитектурный принцип облачной работы агента — **keyless**.
Вместо долгоживущих JSON-ключей сервис-аккаунтов используется Workload
Identity Federation / OIDC: среда предъявляет OIDC-токен, GCP STS меняет
его на короткоживущий access-token, привязанный к конкретной нагрузке.

Ключи не хранятся ни в репозитории, ни в секретах CI — токен живёт минуты
и привязан к конкретной нагрузке. Это закрывает главный вектор утечки:
украсть нечего, а перехваченный токен протухает раньше, чем им
воспользуются.

Firestore Rules — это код безопасности, который тестируется эмулятором
**локально, без облака**: пишешь правило → гоняешь кейсы доступа в
эмуляторе → деплоишь только зелёное. Эмулятор поднимает Firestore в
памяти, поэтому тесты быстрые и не трогают продакшен-данные.

Агент в этой схеме — не «суперпользователь облака», а исполнитель в
песочнице прав: что не разрешено ролью сервис-аккаунта, агент сделать
физически не сможет, даже если его об этом попросить.

---

## ⚠️ Типичные ошибки

- **JSON-ключ в репозитории/CI-секрете.** Классическая утечка; используй
  Workload Identity Federation.
- **`allow read, write: if true`** в Firestore Rules — открытая база.
  По умолчанию всё должно быть запрещено.
- **Путаница `resource.data` и `request.resource.data`** — правило
  выглядит строгим, но проверяет не то состояние документа.
- **Деплой без эмулятора.** Правила безопасности нужно проверять локально
  до выката.
- **Широкие IAM-роли.** `roles/owner` сервис-аккаунту вместо минимально
  необходимых `run.admin` + `iam.serviceAccountUser`.
- **WIF без ограничения по репозиторию.** Привязка по `principalSet` без
  `attribute.repository` позволяет любому репозиторию получить токен.

---

## 🧠 Ключевые концепции

- **Keyless / Workload Identity Federation** — доступ без долгоживущих
  ключей через обмен OIDC-токена.
- **Firestore Rules как код** — тестируемая, версионируемая модель
  доступа; `deny by default`.
- **Эмулятор Firebase** — локальная проверка правил без облака.
- **Least privilege IAM** — минимальные роли сервис-аккаунтов, разделение
  `actAs` и административных прав.
- **MCP как слой изоляции** — агент действует через MCP, в границах прав
  сервис-аккаунта, а не напрямую.
- **Scale-to-zero** — Cloud Run не тарифицируется в простое; влияет на
  выбор между Cloud Run и GKE.

---

## ❓ Контрольные вопросы

Ответьте сами, потом сверьтесь с разбором ниже.

1. Почему JSON-ключ сервис-аккаунта в CI-секрете опаснее, чем Workload
   Identity Federation, даже если секрет «спрятан»?
2. Что произойдёт с запросом на запись, если в Firestore Rules есть только
   блок `match /{document=**} { allow read, write: if false; }` и больше
   ничего?
3. В чём разница между `resource.data` и `request.resource.data` и почему
   это критично для правила на `update`?
4. Зачем гонять правила в эмуляторе, если можно задеплоить и проверить
   на реальном проекте?
5. Сервис-аккаунту деплоя выдали `roles/owner`. Назовите минимальный
   набор ролей для деплоя в Cloud Run и почему он безопаснее.
6. Какую роль играет MCP-слой между LLM-агентом и GCP API с точки зрения
   безопасности?
7. Что в цепочке WIF делает GCP STS и почему полученный токен нельзя
   переиспользовать спустя сутки?
8. Сервис должен «не стоить ничего в простое» и быть простым HTTP-API.
   Cloud Run или GKE? Обоснуйте.

---

## ✅ Разбор ответов

1. **JSON-ключ бессрочен и существует как артефакт.** Его можно
   экспортировать, забыть в логах, утащить через скомпрометированный
   раннер — и он будет валиден, пока его вручную не отзовут. WIF не
   хранит ничего: токен выдаётся на лету, живёт ~час и привязан к
   конкретной нагрузке, так что красть и переиспользовать нечего.
2. **Любая запись (и чтение) будет отклонена.** `match /{document=**}`
   с `if false` — это «запрещено по умолчанию»; без явного разрешающего
   `match` доступа нет ни у кого. Это и есть безопасная база.
3. `resource.data` — состояние документа **до** операции,
   `request.resource.data` — то, что клиент **пытается** записать. В
   правиле на `update` нужно проверять оба: например, что владелец
   (`resource.data.authorId`) не меняется и совпадает с `auth.uid`.
   Проверка только `request.resource.data` позволит «перехватить» чужой
   документ, перезаписав поле владельца.
4. **Эмулятор проверяет правила локально, в памяти, без риска для
   продакшена и без затрат**, и это быстро (можно прогнать десятки
   кейсов доступа в CI). Деплой ради проверки означает, что дырявое
   правило какое-то время работает на реальных данных.
5. Минимум: `roles/run.admin` (управление сервисами Cloud Run) +
   `roles/iam.serviceAccountUser` (право `actAs` для runtime-SA).
   Это безопаснее, потому что компрометация деплой-SA не даёт права на
   биллинг, IAM-политику проекта, базы и прочее, что входит в `owner`.
6. MCP — **слой изоляции и аудита**. Агент не аутентифицируется в облаке
   сам; он делает tool call, а MCP выполняет его в границах прав
   сервис-аккаунта. Действия видны как артефакты и могут быть отменены
   до выполнения. Агент не может выйти за пределы выданной роли.
7. GCP STS выполняет **token exchange**: принимает доверенный OIDC-токен
   среды и выдаёт короткоживущий GCP access-token. Токен имеет срок
   жизни порядка часа и привязан к нагрузке/атрибутам — через сутки он
   давно недействителен, поэтому перехват «на будущее» бесполезен.
8. **Cloud Run.** Он масштабируется до нуля из коробки (нет платы в
   простое), операционная нагрузка минимальна, а для простого HTTP-API
   полноценный Kubernetes — избыточная сложность. GKE оправдан при
   stateful-нагрузках, service mesh или кастомных операторах.

---

## 🧪 Практика

Закрепи в **[Лабе 13 — Облако: Firebase и GCP](../../labs/13/README.md)**
(7 задач): `firebase init`, безопасные Firestore Rules, эмулятор,
keyless-auth, IaC для Cloud Run, разбор Cloud Logging.

## 📚 Источники

1. Workload Identity Federation — https://cloud.google.com/iam/docs/workload-identity-federation
2. Firebase Security Rules — https://firebase.google.com/docs/rules
3. Firebase Local Emulator Suite — https://firebase.google.com/docs/emulator-suite
4. IAM: принцип наименьших привилегий — https://cloud.google.com/iam/docs/using-iam-securely
5. Cloud Run — обзор — https://cloud.google.com/run/docs/overview/what-is-cloud-run
6. Тестирование правил безопасности — https://firebase.google.com/docs/rules/unit-tests
