# TaskTracker

Расширение VS Code: собирает комментарии `TODO`, `FIXME`, `BUG`, `HACK` из файлов рабочего пространства
и показывает их в отдельной панели (значок TaskTracker на боковой панели).

Возможности: фильтр по типу, сортировка (файл / тип / строка), поиск по тексту, переход к строке по клику,
автообновление при изменении файлов.

## Запуск
    npm install
    npm run compile
Затем F5 в VS Code (Run Extension). Пакет: `npx vsce package`.

## Настройки
- `tasktracker.excludedFolders` — исключаемые каталоги (node_modules, .git, out, dist, ...)
- `tasktracker.maxFileSizeKb` — максимальный размер сканируемого файла
