# Сборка

## 0.5 alpha: два Android-варианта

Нужны JDK 17, Python 3.10+, Android Platform 36, Build Tools 35.0.0 и ARM64-совместимый runtime. Общий frontend подготавливается прежними скриптами. `compat` использует каталоги `app/src/compat/assets`, target 28 и отдельную загрузку инструментов. `modern` использует target 36 и подготовленные устанавливаемые нативные библиотеки:

```sh
python tools/prepare_modern_runtime.py --help
# Укажите полный locked runtime из prepare_runtime.py и каталог Android NDK:
python tools/prepare_modern_runtime.py --input work/runtime-full.zip --ndk /path/to/android-ndk-r28 --arch aarch64
# Подпишите компоненты тем же ключом, которым будет подписан хост.
# GCC_STUDIO_KEY_PASSWORD задаётся через окружение, alias ключа — forge.
python tools/prepare_component_runtime.py --prepared-runtime app/src/modern --output app/src/bundle-components --sdk /path/to/android-sdk --keystore /private/host-key.jks
# Отдельный lock desktop-sources.lock.json используется для FFmpeg-исходников desktop.
./gradlew :app:assembleCompatDebug :app:lintCompatRelease
# После подготовки app/src/bundle-components/assets и jniLibs:
./gradlew :app:assembleModernDebug :app:lintModernRelease
```

`build.ps1 -Runtime modern` или `-Runtime compat` выбирает вариант. Для установки обязательны `-Install -DeviceSerial SERIAL`, чтобы не устанавливать сборку на случайное подключённое устройство. Генерируемые runtime и `desktop/node_modules` не входят в Git. Исходники desktop находятся в `desktop/`: `npm ci`, `npm test`, затем `npm run package`; соответствующие FFmpeg-исходники сначала готовятся через `tools/prepare_desktop_sources.py`. Команда `npm run installers` оборачивает готовый пакет в NSIS / deb / pkg на соответствующей ОС.

Modern по умолчанию использует небольшой `app/src/bundle-components`: только программный хост в `jniLibs`, каталог компонентов в `assets`, одно общее нативное окружение APK и пакеты `.studio-toolpack` в `components`. `app/src/modern` остаётся промежуточным полным runtime для генератора. `-PstudioRuntimeDir=/absolute/prepared/path` выбирает другую подготовку, например отдельную тестовую ABI. Перед распространением хоста опубликуйте точные APK и соответствующие исходники по зафиксированному адресу: `--release` генератора задаёт тег GitHub. Каталог содержит контрольные суммы; перепаковка уже опубликованного файла недопустима. Собственный ключ требует пересборки хоста и всех компонентов вместе. [Устройство модульной доставки](MODULAR-RUNTIME-0.5.md).

## Прежний compat runtime

Нужны Python 3.10+, JDK 17 и Android SDK с Platform 35 и Build Tools 35.0.0. С0.3.7 для сборки самого редактора подготовка runtime не требуется: GCC, CMake и общие библиотеки загружаются отдельно через приложение. После установки инструментов работа автономна. [Упаковка, воспроизведение и проверка пакетов](DOWNLOADABLE-RUNTIME-0.3.7.md).

Ниже сохранён процесс подготовки прежнего полного runtime для воспроизведения нативных пакетов. Он использует точные версии `native-packages.lock.json` и SHA256; полученный `runtime.zip` больше не включается в APK.

```sh
python tools/prepare_runtime.py --locked
python tools/split_runtime.py --input app/src/main/assets/runtime.zip --output work/tool-packs
cp app/src/main/assets/runtime.zip work/runtime-full.zip
cp work/tool-packs/runtime-base.zip app/src/main/assets/runtime.zip
python tools/prepare_frontend.py
python tools/prepare_icons.py
python tools/package_notices.py
./gradlew :app:assembleCompatDebug
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
./build.ps1 -ToolsRoot 'C:\AndroidBuildTools' -Runtime compat -Install -DeviceSerial SERIAL
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

Вариант `compat` намеренно использует `targetSdk 28`: Android ограничивает непосредственный запуск сгенерированных программ из приватной папки при target SDK 29+. Вариант `modern` имеет target36 и другой механизм выполнения. См. [Android: removed execute permission](https://developer.android.com/about/versions/10/behavior-changes-10#execute-permission). Эти APK предназначены для установки напрямую; готовность к публикации Google Play не заявляется.


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

С0.3.7 GCC, CMake/Ninja/Make и общие библиотеки публикуются раздельно. Подготовка и границы проверки описаны в [DOWNLOADABLE-RUNTIME-0.3.7](DOWNLOADABLE-RUNTIME-0.3.7.md). Старые дополнительные пакеты не меняются; зависимости устанавливаются автоматически. Каталог в APK фиксирует адреса, размеры и SHA256.

После установки дополнительные инструменты работают локально. На устройстве `ToolPacks` проверяет размер и SHA256 архива, хеши файлов, пути, зависимости и состояние завершённой установки. Основной пакет и файлы других установленных пакетов защищены от удаления. Проекты находятся отдельно от runtime. Для проверки новой установки используйте отдельное окружение runtime, а не только обновление старой полной версии.

Веб-интерфейс обслуживается только по loopback. Открытый HTTP разрешён лишь для 127.0.0.1; загрузки инструментов используют HTTPS. Safe Browsing включён, доступ WebView к file/content URL и сторонним cookies отключён. Это не меняет ограничение target SDK для прямого запуска программ. Подробности будущего перехода: [PLATFORMS.md](PLATFORMS.md).

## Выбор инструментов и начальная настройка

Мастер запуска сохраняет язык и настройки через Android SharedPreferences; его можно снова открыть из настроек. Быстрый режим загружает GCC, CMake, clangd/clang-format и общие библиотеки; полный — все доступные инструменты. Мастер можно пропустить. Установка проверяет опубликованный каталог и SHA-256; доступная версия GCC — 15.2, альтернативный Clang — 21.1.8. Произвольных загрузок других версий пока нет. Изменение стандартов C/C++ не требует загрузки нового компилятора.

Профиль C++ Studio использует отдельные PointerAlignment: Right, ReferenceAlignment: Left и SpaceBeforeRangeBasedForLoopColon: true. Пункт CLion — собственная приближённая конфигурация, не экспорт закрытого formatter JetBrains. Выбор в мастере задаёт стиль новых проектов; существующий .clang-format изменяется только при явном выборе соответствующего пункта.

Проекты доступны системному приложению Files через DocumentsProvider. Оно получает только зарегистрированные проекты и права просмотра; каноническая проверка путей исключает выход через .. и ссылки в runtime/настройки приложения.

## Снимки и отчёты об ошибках

Публичные снимки захватывают только окно IDE через PixelCopy: системные часы, заряд и панель жестов не входят в изображение. Диагностический editorCapture доступен только debug-сборке. Кнопка сообщения об ошибке открывает GitHub Issue Form с версией, Android и моделью устройства. Код, пути проектов и журнал не отправляются автоматически.
