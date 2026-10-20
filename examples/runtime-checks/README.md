# Runtime checks / Ошибки выполнения

The default run prints help. Other modes contain **intentional errors**; run them in an isolated example project. Set one argument per line in Settings → Build.

По умолчанию программа печатает справку. Остальные режимы содержат **намеренные ошибки**. Откройте пример отдельным проектом и задайте один аргумент в настройках сборки.

| Argument | Check |
|---|---|
| `vector` | Debug standard library assertions / проверка границ `std::vector` |
| `use-after-free` | Clang + ASan/UBSan: access after `delete` |
| `division` | UBSan or fatal arithmetic signal |
| `exception` | Uncaught exception; stop on `std::terminate()` |
| `signal` | Invalid pointer; paused stack and locals in Debug |
| `return139` | Ordinary exit code 139, with no invented crash report |

Android uses libc++ hardening in Debug. Desktop GCC uses libstdc++ assertions. Sanitizers require a compiler **and its runtime** that support them; the IDE probes support before building. These checks do not detect every possible C/C++ error. Android leak detection is disabled; under a debugger leak detection is also disabled where ptrace prevents it.
