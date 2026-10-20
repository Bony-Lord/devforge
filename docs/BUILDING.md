# Сборка

Нужны Python 3.10+, JDK 17 и Android SDK с Platform 35 и Build Tools 35.0.0. Нативное окружение отдельно собирается из точных версий `native-packages.lock.json`; загрузки проверяются по SHA256. На этапе подготовки нужен интернет, затем сам APK работает автономно.

```sh
python tools/prepare_runtime.py --locked
python tools/split_runtime.py --input app/src/main/assets/runtime.zip --output work/tool-packs
cp app/src/main/assets/runtime.zip work/runtime-full.zip
cp work/tool-packs/runtime-base.zip app/src/main/assets/runtime.zip
python tools/prepare_frontend.py
python tools/prepare_icons.py
python tools/package_notices.py
./gradlew :app:assembleDebug
```

На Windows используйте `gradlew.bat`. Для Android Studio сначала выполните подготовку runtime, затем откройте корневую папку проекта.

В репозитории находится небольшой ARM64 PTY-relay вместе с исходником `native/forge-pty.c`. Его можно пересобрать Android NDK Clang для `aarch64-linux-android28` либо GCC внутри приложения:

```sh
gcc-15 -O2 native/forge-pty.c -o native/forge-pty-aarch64
```

Эта команда предназначена для окружения, где GCC уже запускается на Android. На настольной машине используйте соответствующий кросс-компилятор NDK. Для других ABI также потребуются соответствующий relay и нативный runtime; опубликованная и физически проверенная сборка — ARM64.

## Сборка на Windows

`build.ps1` запускает Gradle, который обрабатывает ресурсы нативного Sora Editor и его зависимости. Параметр `ToolsRoot` указывает каталог с Android SDK и JDK; структуру путей можно настроить в начале скрипта. Начиная с 0.2.0 сборка одним `javac`/AAPT не поддерживается.

```powershell
python tools/prepare_runtime.py --locked
python tools/split_runtime.py --input app/src/main/assets/runtime.zip --output work/tool-packs
Copy-Item app/src/main/assets/runtime.zip work/runtime-full.zip
Copy-Item work/tool-packs/runtime-base.zip app/src/main/assets/runtime.zip -Force
python tools/package_notices.py
./build.ps1 -ToolsRoot 'C:\AndroidBuildTools' -Install
./build.ps1 -ToolsRoot 'C:\AndroidBuildTools' -Release
```

Первый запуск создаёт локальный ключ в `work/build/` с параметрами для разработки из скрипта. Сам файл ключа не попадает в Git. Для обновления уже установленной сборки нужен тот же ключ; собственная сборка использует другой ключ.

В release-сборке отключены `debuggable` и отладочный доступ к WebView. Для автоматизированных проверок устройства нужна debug-сборка.

## Замена нативного редактора

Sora Editor 0.24.4 подключён как Maven AAR `io.github.rosemoe:editor:0.24.4`. Точный исходный commit и контрольная сумма архива указаны в `editor-component.lock.json`; исходники с Gradle wrapper и build-системой распространяются как `sora-editor-0.24.4-sources.zip` рядом с APK.

Для собственной версии библиотеки распакуйте архив, измените исходники и соберите модуль `:editor` его Gradle wrapper. Для подключения полученного AAR замените зависимость Sora в `app/build.gradle` на `implementation files('libs/editor-custom.aar')`, скопируйте AAR в `app/libs/` и добавьте явные зависимости из его Maven POM: Kotlin stdlib 2.2.21, AndroidX Collection 1.5.0 и Annotation 1.9.1. После этого пересоберите APK и подпишите своим ключом. Код хоста и ресурсы доступны полностью; ограничений на такую пересборку нет.

## Проверка реальных жестов

Тестовый модуль `gesture-tests` использует targetSdk 35 и не запускает компиляторы. Выберите отдельный приватный проект с именем `input-check-*`: модуль специально отказывается менять пользовательские проекты. Соберите debug-приложение и тестовый APK одним ключом, затем выполните:

```sh
./gradlew :gesture-tests:assembleDebug
adb install -t -r gesture-tests/build/outputs/apk/debug/gesture-tests-debug.apk
adb shell am instrument -w com.forgex.gesturetests/dev.forge.ide.NativeInputInstrumentation
adb uninstall com.forgex.gesturetests
```

Проверяются реальные серые spans неиспользуемого кода, диагностика clangd в нативном представлении, прокрутка 6000 строк, масштабирование настоящими двухпальцевыми событиями и нативный ввод при занятом JavaScript-потоке WebView. Это дополняет проверки экранной клавиатуры, а не заменяет их. Для этих проверок нужен распакованный runtime приложения и готовый clangd.

## Исходники нативных компонентов

```sh
python tools/prepare_sources.py
```

Скрипт сохраняет GNU/copyleft-исходники, исходные патчи и точные снимки рецептов в `native-sources/`. Контрольные суммы, версии и источники фиксируются в `sources.lock.json`. Эти архивы распространяются рядом с бинарным APK в Releases; большие файлы не кладутся в Git.

Для пересборки самих GCC, GDB и библиотек следуйте включённым рецептам Termux/TUR на поддерживаемом Linux-хосте. Скрипт `prepare_runtime.py` выполняет документированное изменение префикса, корректировку порядка заголовков GCC и упаковку runtime.

Приложение намеренно использует `targetSdk 28`: Android ограничивает непосредственный запуск сгенерированных программ из приватной папки при target SDK 29+. См. [Android: removed execute permission](https://developer.android.com/about/versions/10/behavior-changes-10#execute-permission). Это APK для установки напрямую, а не готовая конфигурация публикации Google Play.


## Локальные проверки редактора

```sh
mkdir -p build/core-checks
javac -encoding UTF-8 -d build/core-checks app/src/main/java/dev/forge/ide/{SmartTyping,FileCodec}.java tests/java/dev/forge/ide/{SmartTypingTest,FileCodecTest}.java
java -cp build/core-checks dev.forge.ide.SmartTypingTest
java -cp build/core-checks dev.forge.ide.FileCodecTest
javac -encoding UTF-8 -d build/core-checks app/src/main/java/dev/forge/ide/FileTemplates.java tests/java/dev/forge/ide/FileTemplatesTest.java
java -cp build/core-checks dev.forge.ide.FileTemplatesTest
node tests/interaction.test.cjs
./gradlew :app:testDebugUnitTest
node tests/native-editor-state.test.cjs
python -m pip install --target build/test-tools clang-format==21.1.8 --no-deps
python tests/formatter_host_checks.py --binary build/test-tools/clang_format/data/bin/clang-format
```

На Windows путь к тестовому clang-format заканчивается на `clang-format.exe`; команды с `{...}` выше рассчитаны на bash. JVM-проверки используют настоящие классы текста и undo Sora. Android-заглушки JVM не являются проверкой IME или отрисовки.

Дополнительные сценарии на отдельном проекте `input-check-*`:

```sh
adb shell am instrument -w -e smart true com.forgex.gesturetests/dev.forge.ide.NativeInputInstrumentation
adb shell am instrument -w -e tabs true com.forgex.gesturetests/dev.forge.ide.NativeInputInstrumentation
```

Запускайте их только когда устройство доступно для тестирования: сценарии меняют тестовый файл, переключают вкладки и требуют debug-сборку. Текущий статус выполнения указан в VERIFICATION.md.


Для проверки только оболочки в браузере выполните `python tools/preview_shell.py` и откройте `http://127.0.0.1:8766/?language=ru` либо `?language=en`. Этот предпросмотр использует тестовый проект и синтетический адаптер: нативный редактор, клавиатура, компиляторы и настоящие файлы там не работают. Он предназначен для верстки и локализации.

## Минимальный APK и дополнительные инструменты

`split_runtime.py` принимает полный проверенный runtime от `prepare_runtime.py`. Он строит замыкание ELF DT_NEEDED, сохраняет стартовые объекты и linker scripts, затем создаёт основной архив и четыре дополнительных пакета. Замените `app/src/main/assets/runtime.zip` основным `runtime-base.zip`; сохраните полный архив отдельно для повторной упаковки. `tool-packs.json` генерируется с SHA256 и списками владения файлами. Публикуйте дополнительные ZIP вместе с их контрольными суммами по фиксированному release URL; изменение пакета требует обновить каталог в APK. Нельзя заменять архив произвольной новой версией по прежнему URL, не пересобрав каталог.

После установки дополнительные инструменты работают локально. На устройстве `ToolPacks` проверяет размер и SHA256 архива, хеши файлов, пути, зависимости и состояние завершённой установки. Основной пакет и файлы других установленных пакетов защищены от удаления. Проекты находятся отдельно от runtime. Для проверки новой установки используйте отдельное окружение runtime, а не только обновление старой полной версии.

Веб-интерфейс обслуживается только по loopback. Открытый HTTP разрешён лишь для 127.0.0.1; загрузки инструментов используют HTTPS. Safe Browsing включён, доступ WebView к file/content URL и сторонним cookies отключён. Это не меняет ограничение target SDK для прямого запуска программ. Подробности будущего перехода: [PLATFORMS.md](PLATFORMS.md).

## Выбор инструментов и начальная настройка

Мастер запуска сохраняет язык и настройки через Android SharedPreferences; его можно снова открыть из настроек. Быстрый режим добавляет clangd/clang-format к GCC/CMake, полный — все четыре дополнительных пакета. Установка проверяет опубликованный каталог и SHA-256; версия GCC в базовой сборке — 15.2, альтернативный Clang — 21.1.8. Произвольных загрузок других версий пока нет. Изменение стандартов C/C++ не требует загрузки нового компилятора.

Профиль C++ Studio использует отдельные PointerAlignment: Right, ReferenceAlignment: Left и SpaceBeforeRangeBasedForLoopColon: true. Пункт CLion — собственная приближённая конфигурация, не экспорт закрытого formatter JetBrains. Выбор в мастере задаёт стиль новых проектов; существующий .clang-format изменяется только при явном выборе соответствующего пункта.

Проекты доступны системному приложению Files через DocumentsProvider. Оно получает только зарегистрированные проекты и права просмотра; каноническая проверка путей исключает выход через .. и ссылки в runtime/настройки приложения.

## Снимки и отчёты об ошибках

Публичные снимки захватывают только окно IDE через PixelCopy: системные часы, заряд и панель жестов не входят в изображение. Диагностический editorCapture доступен только debug-сборке. Кнопка сообщения об ошибке открывает GitHub Issue Form с версией, Android и моделью устройства. Код, пути проектов и журнал не отправляются автоматически.
