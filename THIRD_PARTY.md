# Сторонние компоненты

| Компонент | Лицензия / источник |
|---|---|
| Monaco Editor 0.52.2 | MIT, [Microsoft](https://github.com/microsoft/monaco-editor) |
| Sora Editor 0.24.4 | LGPL-2.1-or-later, [Rosemoe](https://github.com/Rosemoe/sora-editor/tree/0.24.4); нативный редактор, без изменений исходников библиотеки |
| Lucide icons | ISC; часть иконок унаследована от Feather/MIT. Точный commit и SHA256 — `icons.lock.json` |
| yaml 2.9.1 | ISC, точная версия и integrity — `frontend-vendor.lock.json` |
| dockview-core 8.3.1 | MIT, [Dockview](https://github.com/dockview/dockview); точный пакет и SHA256 — `dockview.lock.json`. Свободный core, без dockview-enterprise. Локальная правка устраняет конфликт перемещения плавающего заголовка мышью с pointer-docking; повторяется через `tools/vendor_dockview.py` |
| Kotlin standard library / AndroidX Collection / AndroidX Annotation | Apache-2.0, зависимости Sora; версии фиксируются его Maven POM |
| LLVM, Clang, clangd, libc++ | Apache-2.0 с LLVM exceptions и NCSA; см. точные notices в `licenses/native/` |
| Визуализаторы GDB libc++ 21.1.8 | Apache-2.0 WITH LLVM-exception, [LLVM libcxx/utils/gdb](https://github.com/llvm/llvm-project/tree/llvmorg-21.1.8/libcxx/utils/gdb); исходник и SHA256 — `debug-printers.lock.json` |
| GCC 15.2 | GPL-3.0, части runtime с GCC Runtime Library Exception |
| Binutils, GDB, GNU Make | GPL-3.0 и сопутствующие лицензии исходных компонентов |
| Git | GPL-2.0 |
| CMake | BSD 3-Clause |
| Ninja | Apache-2.0 |
| JetBrains Mono | SIL OFL-1.1, [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) |
| Inter | SIL OFL-1.1, [Inter](https://github.com/rsms/inter) |
| Gradle wrapper | Apache-2.0 |

Все остальные нативные зависимости перечислены с версиями, URL и SHA256 в `native-packages.lock.json`; их исходные license/copyright-файлы находятся в `licenses/native/`. Лицензии также включены в APK и доступны через справку приложения.

Бинарные пакеты получены из [Termux packages](https://github.com/termux/termux-packages) и [Termux User Repository](https://github.com/termux-user-repository/tur). Само приложение Termux, его интерфейс и код хоста не включаются.

Изменения runtime: равнодлинная замена `/data/data/com.termux` на `/data/data/com.forgex`, удаление необязательных утилит и development-файлов, исправление порядка заголовков C++ в GCC specs, заголовок совместимости `bits/stdc++.h` поверх libc++, системная оболочка и собственный PTY-relay. `tools/split_runtime.py` разделяет этот runtime на основной GCC/CMake/Ninja и дополнительные пакеты; основной пакет использует GNU ld.bfd и GNU binutils вместо LLVM-алиасов. Содержимое и зависимости файлов фиксируются в `tool-packs.json`. Временные метки исходных и скомпилированных Guile-модулей сохраняются, чтобы GDB использовал готовые модули при первом запуске.

Исходники изменённых GPL/LGPL-компонентов, upstream-патчи, рецепты и их build-системы предоставлены в архиве **native-corresponding-sources.zip** рядом с APK. В `native-sources/sources.lock.json` приведён полный список с контрольными суммами. Динамические LGPL-библиотеки можно заменить при собственной сборке runtime; технических ограничений на модифицированные сборки нет.

Цветовая схема и расположение элементов разработаны по образцу CLion Dark. Собственный бренд приложения — C++ Studio. Закрытый исходный код, логотипы и фирменные иконки CLion не копировались. Названия GNU/GCC, LLVM и JetBrains принадлежат соответствующим правообладателям; связи или одобрения ими проекта не заявляется.

Точные исходники Sora 0.24.4 предоставляются в `sora-editor-0.24.4-sources.zip` рядом с APK. Java-код хоста, ресурсы, Gradle-конфигурация и инструкции сборки опубликованы, поэтому приложение можно пересобрать с изменённой версией LGPL-библиотеки. Разрешены необходимые для отладки модификаций библиотеки обратная разработка и пересборка; технической проверки подписи библиотеки или защиты от её замены нет. Для установки собственной сборки поверх официальной требуется собственный ключ либо удаление прежней установки после сохранения проектов.


### Поведение Smart Keys

`SmartTyping.java` написан для этого приложения. Поведение сверялось с публичной [документацией Smart Keys CLion](https://www.jetbrains.com/help/clion/settings-smart-keys.html) и открытыми обработчиками `TypedHandler` / `TypedParenImpl` в [IntelliJ Community](https://github.com/JetBrains/intellij-community/tree/master/platform/lang-impl/src/com/intellij/codeInsight/editorActions), распространяемыми под Apache-2.0. Код этих обработчиков в приложение не переносился; закрытый код CLion не используется.

Полная проверка происхождения и условий распространения: [LICENSE-AUDIT.md](docs/LICENSE-AUDIT.md). Инвентарь уведомлений 56 пакетов: [package-notices.json](licenses/package-notices.json). Символические ссылки copyright разрешены в соответствующие тексты из точного снимка Termux; пять дочерних пакетов ссылаются на уведомления LLVM/ncurses. JetBrains и CLion — товарные знаки JetBrains s.r.o.
