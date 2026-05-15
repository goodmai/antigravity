# Artifacts — что студент сдаёт

> Курс доказывается **репозиторием**, а не тестом. Каждый модуль
> оставляет C4-диаграмму и ADR; capstone сводит три проекции в матрицу
> выбора. Здесь — шаблоны и заготовки этих артефактов.

## Состав

| Папка / файл | Артефакт | Где требуется |
|---|---|---|
| [`adr/0000-template.md`](./adr/0000-template.md) | шаблон ADR (Nygard) | все ADR |
| [`adr/0001…0005`](./adr/) | 5 заготовок ADR с вопросами | уроки 1.3, 1.10, 2.2, 3.2, 3.10 |
| [`c4/context.puml`](./c4/context.puml) | C4 Context (общий для 3 проекций) | урок 1.1 |
| [`c4/container-classic.puml`](./c4/container-classic.puml) | C4 Container «классика» | урок 1.11 |
| [`c4/container-gcp.puml`](./c4/container-gcp.puml) | C4 Container «Google» | урок 2.11 |
| [`c4/container-hybrid.puml`](./c4/container-hybrid.puml) | C4 Container «гибрид» | урок 3.13 |
| [`capstone-matrix.md`](./capstone-matrix.md) | матрица выбора 9×3 + threat-model | урок 3.13 |

## Как рендерить C4

`.puml` используют [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML).

```bash
# любой из вариантов
docker run --rm -v "$PWD:/wd" plantuml/plantuml -tsvg /wd/c4/context.puml
# или онлайн: https://www.plantuml.com/plantuml  (вставить содержимое)
```

## Критерий завершения курса (из plan.md §6)

1. C4 Context + Container по **каждому** из 3 модулей.
2. ≥5 заполненных ADR (по одному на спорное решение).
3. Capstone: матрица 9×3 + эталонный гибрид с обоснованием trade-off
   и threat-model.
4. Защита выбора «централизовать / отдать Google / децентрализовать» —
   с цифрами по стоимости, латентности и суверенитету данных.
