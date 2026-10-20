# Runtime checks / Проверки выполнения

**Debug enables standard-library checks by default.** Android uses libc++ extensive hardening; desktop GCC uses libstdc++ assertions. The IDE keeps frame pointers and debug symbols. Settings → Build also offers Clang ASan + UBSan, or disabling the additional checks. Release builds omit these IDE-added checks.

**В Debug проверки стандартной библиотеки включены по умолчанию.** В настройках сборки можно дополнительно выбрать ASan + UBSan. На Android этот режим требует Clang. Поддержка проверяется настоящей пробной сборкой: IDE сообщает о недоступном режиме и не отключает проверки незаметно.

The fault panel contains the cause, source locations, stack frames when available, raw details and a copy button. Android can resolve sanitizer module offsets locally through addr2line, including the allocation, free and invalid-access locations. Reports are not automatically uploaded. GDB stops on fatal memory/arithmetic signals and on `abort()` / `std::terminate()`; it selects the nearest project frame and keeps variables available. “Break on every throw” is optional and also pauses on **caught** exceptions.

Примеры с намеренными ошибками находятся в [examples/runtime-checks](../examples/runtime-checks). Без аргументов пример безопасно печатает справку. Режимы: `vector`, `use-after-free`, `division`, `exception`, `signal`, `return139`.

These checks do not prove a program is free of bugs. Standard library hardening does not instrument arbitrary pointers; sanitizers add execution/memory overhead and have platform limits. Android leak detection is disabled, and desktop leak detection is disabled during debugging where ptrace prevents it. An explicit `return 139` remains an ordinary exit code, not an invented segmentation fault.

The sanitizer profile belongs to the compiled artifact, so changing settings after compilation does not accidentally run a sanitized program without its runtime. Stop cancels the child process tree; the IDE remains a separate process from the program being debugged.
