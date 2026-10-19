# Сборка

Нужны Python 3.10+, JDK 17 и Android SDK с Platform 35 и Build Tools 35.0.0. Нативное окружение отдельно собирается из точных версий `native-packages.lock.json`; загрузки проверяются по SHA256. На этапе подготовки нужен интернет, затем сам APK работает автономно.

```sh
python tools/prepare_runtime.py --locked
python tools/package_notices.py
./gradlew :app:assembleDebug
```

На Windows используйте `gradlew.bat`. Для Android Studio сначала выполните подготовку runtime, затем откройте корневую папку проекта.

В репозитории находится небольшой ARM64 PTY-relay вместе с исходником `native/forge-pty.c`. Его можно пересобрать Android NDK Clang для `aarch64-linux-android28` либо GCC внутри приложения:

```sh
gcc-15 -O2 native/forge-pty.c -o native/forge-pty-aarch64
```

Эта команда предназначена для окружения, где GCC уже запускается на Android. На настольной машине используйте соответствующий кросс-компилятор NDK. Для других ABI также потребуются соответствующий relay и нативный runtime; опубликованная и физически проверенная сборка — ARM64.

## Сборка без Gradle на Windows

`build.ps1` использует `javac`, D8, AAPT, zipalign и apksigner. Параметр `ToolsRoot` указывает каталог с Android SDK и JDK; структуру путей можно настроить в начале скрипта. Это путь, которым собран и проверен APK первого релиза.

```powershell
python tools/prepare_runtime.py --locked
python tools/package_notices.py
./build.ps1 -ToolsRoot 'C:\AndroidBuildTools' -Install
./build.ps1 -ToolsRoot 'C:\AndroidBuildTools' -Release
```

Первый запуск создаёт локальный ключ в `work/build/` с параметрами для разработки из скрипта. Сам файл ключа не попадает в Git. Для обновления уже установленной сборки нужен тот же ключ; собственная сборка использует другой ключ.

В release-сборке отключены `debuggable` и отладочный доступ к WebView. Для автоматизированных проверок устройства нужна debug-сборка.

## Исходники нативных компонентов

```sh
python tools/prepare_sources.py
```

Скрипт сохраняет GNU/copyleft-исходники, исходные патчи и точные снимки рецептов в `native-sources/`. Контрольные суммы, версии и источники фиксируются в `sources.lock.json`. Эти архивы распространяются рядом с бинарным APK в Releases; большие файлы не кладутся в Git.

Для пересборки самих GCC, GDB и библиотек следуйте включённым рецептам Termux/TUR на поддерживаемом Linux-хосте. Скрипт `prepare_runtime.py` выполняет документированное изменение префикса, корректировку порядка заголовков GCC и упаковку runtime.

Приложение намеренно использует `targetSdk 28`: Android ограничивает непосредственный запуск сгенерированных программ из приватной папки при target SDK 29+. См. [Android: removed execute permission](https://developer.android.com/about/versions/10/behavior-changes-10#execute-permission). Это APK для установки напрямую, а не готовая конфигурация публикации Google Play.
